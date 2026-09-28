/**
 * Produits de la boutique dans la langue de l'utilisateur.
 *
 * Le catalogue (~5 300 produits) est importé en français. Plutôt que de tout
 * traduire d'avance — des milliers d'appels AliExpress pour des langues que
 * personne ne lit peut-être —, on traduit à la demande : la première fois
 * qu'un produit s'affiche dans une langue, AliExpress fournit son titre et sa
 * description dans cette langue (`target_language`), et on les garde en base.
 *
 * Deux régimes :
 *  - listes (rayon, recherche, cadeaux, panier…) : jamais d'attente. Le cache
 *    est appliqué, les manquants partent dans une file d'arrière-plan et
 *    s'afficheront traduits au prochain passage ;
 *  - fiche produit : on attend la traduction (4 s au plus), parce que c'est là
 *    qu'on lit vraiment le texte.
 *
 * Une traduction n'est jamais une raison d'échouer : toute erreur retombe sur
 * le français, avec un simple avertissement dans les logs.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { AliExpressService } from './aliexpress.service';
import { translationTarget, type TranslationTarget } from './product-locales';

interface CachedText {
  title: string;
  description: string | null;
}

interface Job {
  productId: string;
  target: TranslationTarget;
}

/** Ce qu'un produit doit exposer pour être traduit. */
type Localizable = { id: string; title: string; description?: string | null };

@Injectable()
export class ProductTranslationService {
  private readonly logger = new Logger(ProductTranslationService.name);

  /**
   * Produits mis en file par affichage de liste. Une page de rayon en montre
   * 20 à 40 : on n'en demande que 10, les suivants viendront aux affichages
   * d'après. Sans ce plafond, un défilement rapide dans un rayon enverrait des
   * centaines d'appels d'un coup sur un jeton AliExpress partagé avec SPORTIA.
   */
  static readonly MAX_ENQUEUE_PER_CALL = 10;
  /** Au-delà, les nouveaux travaux sont ignorés — ils reviendront au prochain affichage. */
  static readonly MAX_QUEUE = 200;
  /** Appels AliExpress simultanés depuis la file : faible, c'est du confort, pas de l'urgent. */
  static readonly CONCURRENCY = 2;
  /** Délai max d'attente de la traduction sur une fiche produit. */
  static readonly DETAIL_TIMEOUT_MS = 4000;
  /**
   * Verrou par produit+langue. Il évite qu'une même traduction soit demandée
   * en parallèle (deux utilisateurs, deux instances de l'API) et, s'il reste
   * posé après un échec, qu'un produit introuvable chez AliExpress soit
   * redemandé à chaque affichage.
   */
  static readonly LOCK_TTL_SECONDS = 10 * 60;

  private readonly queue: Job[] = [];
  /** Clés déjà en file dans ce processus — le verrou Redis couvre le reste. */
  private readonly pending = new Set<string>();
  private running = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliexpress: AliExpressService,
    private readonly redis: RedisService,
  ) {}

  // ── Listes ────────────────────────────────────────────────────────────────

  /**
   * Applique les traductions en cache à une liste de produits et renvoie
   * immédiatement. Les produits sans traduction restent en français et sont
   * mis en file pour la prochaine fois.
   */
  async localize<T extends Localizable>(products: T[], locale: string): Promise<T[]> {
    const target = translationTarget(locale);
    if (!target || products.length === 0) return products;

    const cached = await this.cached(products.map((p) => p.id), target);
    this.enqueueMissing(products.map((p) => p.id), cached, target);
    return products.map((p) => this.apply(p, cached.get(p.id)));
  }

  /**
   * Même chose pour les lignes du panier, qui portent `productId` et `title`
   * du produit courant (le panier relit le catalogue à chaque affichage).
   */
  async localizeCart<C extends { lines: Array<{ productId: string; title: string }> }>(
    cart: C,
    locale: string,
  ): Promise<C> {
    const target = translationTarget(locale);
    if (!target || cart.lines.length === 0) return cart;

    const ids = [...new Set(cart.lines.map((l) => l.productId))];
    const cached = await this.cached(ids, target);
    this.enqueueMissing(ids, cached, target);
    return {
      ...cart,
      lines: cart.lines.map((l) => {
        const tr = cached.get(l.productId);
        return tr ? { ...l, title: tr.title } : l;
      }),
    };
  }

  // ── Fiche produit ─────────────────────────────────────────────────────────

  /**
   * Fiche produit : la traduction est obtenue tout de suite si elle manque
   * (au plus `DETAIL_TIMEOUT_MS`). Si AliExpress est lent, l'appel continue en
   * arrière-plan et enregistre quand même le résultat : la prochaine ouverture
   * de la fiche sera traduite. Les suggestions (`related`) suivent le régime
   * des listes.
   */
  async localizeDetail<P extends Localizable & { related?: Localizable[] }>(product: P, locale: string): Promise<P> {
    const target = translationTarget(locale);
    if (!target) return product;

    let tr = (await this.cached([product.id], target)).get(product.id);
    if (!tr) {
      tr = (await this.withTimeout(this.translate(product.id, target), ProductTranslationService.DETAIL_TIMEOUT_MS)) ?? undefined;
    }

    const localized = this.apply(product, tr);
    if (Array.isArray(product.related) && product.related.length) {
      return { ...localized, related: await this.localize(product.related, locale) };
    }
    return localized;
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private apply<T extends Localizable>(product: T, tr: CachedText | undefined): T {
    if (!tr) return product;
    const out = { ...product, title: tr.title };
    // La description n'est remplacée que si l'objet en porte une (les listes
    // n'en renvoient pas) et si AliExpress en a fourni une : sinon la fiche
    // garde la description française plutôt qu'un bloc vide.
    if ('description' in product && tr.description) (out as Localizable).description = tr.description;
    return out;
  }

  private async cached(productIds: string[], target: TranslationTarget): Promise<Map<string, CachedText>> {
    const map = new Map<string, CachedText>();
    if (productIds.length === 0) return map;
    try {
      const rows = await this.prisma.productTranslation.findMany({
        where: { productId: { in: productIds }, locale: target.storeLocale },
        select: { productId: true, title: true, description: true },
      });
      for (const r of rows) map.set(r.productId, { title: r.title, description: r.description });
    } catch (e) {
      this.logger.warn(`Lecture des traductions impossible : ${(e as Error).message}`);
    }
    return map;
  }

  private enqueueMissing(productIds: string[], cached: Map<string, CachedText>, target: TranslationTarget): void {
    const missing = productIds.filter((id) => !cached.has(id)).slice(0, ProductTranslationService.MAX_ENQUEUE_PER_CALL);
    for (const productId of missing) this.enqueue({ productId, target });
  }

  /** Fire-and-forget : ne renvoie rien à attendre, n'échoue jamais. */
  private enqueue(job: Job): void {
    if (!this.aliexpress.isConfigured()) return;
    const key = this.key(job.productId, job.target);
    if (this.pending.has(key) || this.queue.length >= ProductTranslationService.MAX_QUEUE) return;
    this.pending.add(key);
    this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.running < ProductTranslationService.CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      this.translate(job.productId, job.target)
        .catch(() => null)
        .finally(() => {
          this.running--;
          this.pending.delete(this.key(job.productId, job.target));
          this.pump();
        });
    }
  }

  /**
   * Demande la traduction à AliExpress et l'enregistre. `null` si elle n'a pas
   * pu être obtenue (verrou tenu ailleurs, produit sans identifiant
   * AliExpress, erreur) — jamais d'exception.
   */
  private async translate(productId: string, target: TranslationTarget): Promise<CachedText | null> {
    try {
      if (!this.aliexpress.isConfigured()) return null;

      // Redis indisponible : on traduit quand même plutôt que de bloquer la
      // fonction entière (même choix que les rappels de paiement).
      const locked = await this.redis.raw
        .set(`shop:tr:${this.key(productId, target)}`, '1', 'EX', ProductTranslationService.LOCK_TTL_SECONDS, 'NX')
        .catch(() => 'OK');
      if (locked !== 'OK') return null;

      // Une autre instance a pu la produire entre-temps.
      const existing = await this.prisma.productTranslation.findUnique({
        where: { productId_locale: { productId, locale: target.storeLocale } },
        select: { title: true, description: true },
      });
      if (existing) return existing;

      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { aliexpressProductId: true },
      });
      if (!product?.aliexpressProductId) return null;

      const text = await this.aliexpress.getProductText(product.aliexpressProductId, target.aliexpressLanguage);
      if (!text) {
        this.logger.warn(`Traduction ${target.aliexpressLanguage} indisponible pour le produit ${productId}`);
        return null;
      }

      const saved = await this.prisma.productTranslation.upsert({
        where: { productId_locale: { productId, locale: target.storeLocale } },
        create: { productId, locale: target.storeLocale, title: text.title, description: text.description ?? null },
        update: { title: text.title, description: text.description ?? null },
        select: { title: true, description: true },
      });
      return saved;
    } catch (e) {
      this.logger.warn(`Traduction du produit ${productId} (${target.storeLocale}) échouée : ${(e as Error).message}`);
      return null;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private key(productId: string, target: TranslationTarget): string {
    return `${productId}:${target.storeLocale}`;
  }
}
