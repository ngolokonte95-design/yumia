/**
 * Import du catalogue : recherche AliExpress → produits YUMIA.
 *
 * Trois filtres successifs avant d'importer quoi que ce soit, parce qu'une
 * recherche AliExpress brute est inexploitable telle quelle (titres bourrés de
 * mots-clés, camelote, contrefaçons) :
 *   1. pertinence  — le titre parle-t-il vraiment du sujet du rayon ?
 *   2. camelote    — porte-clés/stickers qui ne sont pas le produit attendu
 *   3. interdits   — marques contrefaites et matériel réglementé
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AliExpressService, sellingPriceCents } from './aliexpress.service';
import {
  SHOP_CATEGORIES,
  isBanned,
  isJunk,
  isRelevant,
  normalize,
  titleSignature,
  tooSimilar,
} from './shop-categories';

export interface ImportReport {
  category: string;
  imported: number;
  skipped: {
    irrelevant: number;
    junk: number;
    banned: number;
    duplicate: number;
    similar: number;
    noPrice: number;
  };
}

@Injectable()
export class ShopImportService {
  private readonly logger = new Logger(ShopImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliexpress: AliExpressService,
  ) {}

  /** Crée/rafraîchit les rayons à partir de SHOP_CATEGORIES (idempotent). */
  async seedCategories(): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const c of SHOP_CATEGORIES) {
      const existing = await this.prisma.shopCategory.findUnique({ where: { slug: c.slug } });
      const data = { nameFr: c.nameFr, emoji: c.emoji, universe: c.universe ?? null, sortOrder: c.sortOrder };
      if (existing) {
        await this.prisma.shopCategory.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.shopCategory.create({ data: { slug: c.slug, ...data } });
        created++;
      }
    }
    return { created, updated };
  }

  /**
   * Importe des produits dans un rayon.
   *
   * `limitPerTerm` est le nombre de produits retenus PAR TERME de recherche,
   * pas le total du rayon — et c'est lui qui gouverne la diversité. AliExpress
   * renvoie les mieux classés d'un terme, donc en prendre dix sur
   * « cadenas TSA bagage » donne dix cadenas. Quatre par terme sur douze termes
   * remplit un rayon d'une cinquantaine d'articles sans jamais empiler plus de
   * quatre variantes d'un même objet.
   */
  async importCategory(slug: string, limitPerTerm = 4): Promise<ImportReport> {
    const seed = SHOP_CATEGORIES.find((c) => c.slug === slug);
    if (!seed) throw new Error(`Rayon inconnu : ${slug}`);

    const category = await this.prisma.shopCategory.findUnique({ where: { slug } });
    if (!category) throw new Error(`Rayon absent en base (lancer seedCategories) : ${slug}`);

    const report: ImportReport = {
      category: slug,
      imported: 0,
      skipped: { irrelevant: 0, junk: 0, banned: 0, duplicate: 0, similar: 0, noPrice: 0 },
    };

    // Signatures des produits DÉJÀ en rayon : sans elles, un second import
    // rajouterait les jumeaux du premier, chaque passe étant aveugle aux
    // précédentes.
    const known = (
      await this.prisma.product.findMany({
        where: { categoryId: category.id },
        select: { title: true },
      })
    ).map((p) => titleSignature(p.title));

    for (const term of seed.searchTerms) {
      const results = await this.aliexpress.search(term, 1, limitPerTerm * 3);
      let importedForTerm = 0;

      for (const r of results) {
        if (importedForTerm >= limitPerTerm) break;
        if (isBanned(r.title)) { report.skipped.banned++; continue; }
        if (isJunk(r.title)) { report.skipped.junk++; continue; }
        if (!isRelevant(r.title, seed.keywords)) { report.skipped.irrelevant++; continue; }
        if (r.priceCents <= 0) { report.skipped.noPrice++; continue; }

        const exists = await this.prisma.product.findUnique({
          where: { aliexpressProductId: r.productId },
          select: { id: true },
        });
        if (exists) { report.skipped.duplicate++; continue; }

        const signature = titleSignature(r.title);
        if (known.some((k) => tooSimilar(signature, k))) { report.skipped.similar++; continue; }

        try {
          await this.importOne(r.productId, r.title, r.priceCents, r.imageUrl, category.id, slug);
          known.push(signature);
          report.imported++;
          importedForTerm++;
        } catch (e) {
          this.logger.warn(`Import échoué pour ${r.productId} : ${(e as Error).message}`);
        }
      }
    }

    this.logger.log(`Rayon ${slug} : ${report.imported} produits importés`);
    return report;
  }

  private async importOne(
    aliexpressProductId: string,
    title: string,
    aePriceCents: number,
    fallbackImage: string | undefined,
    categoryId: string,
    categorySlug: string,
  ): Promise<void> {
    const detail = await this.aliexpress.getProductDetail(aliexpressProductId);
    const priceCents = sellingPriceCents(aePriceCents);

    const images = detail.images.length ? detail.images : fallbackImage ? [fallbackImage] : [];
    // La description vendeur est souvent absente ou inutilisable : un repli
    // propre vaut mieux qu'un bloc vide sur la fiche produit.
    const description = detail.description ?? `${title} — expédié par notre partenaire, livraison suivie.`;

    await this.prisma.product.create({
      data: {
        slug: await this.uniqueSlug(title),
        title,
        description,
        priceCents,
        // Prix barré à +30 % : repère de réduction cohérent, jamais en dessous
        // du prix réel (sinon la remise affichée serait mensongère).
        compareAtCents: Math.round(priceCents * 1.3),
        images,
        videoUrl: detail.videoUrl ?? null,
        specifications: detail.specifications,
        tags: [categorySlug],
        rating: detail.rating ?? null,
        reviewsCount: detail.reviewsCount ?? 0,
        salesCount: detail.salesCount ?? 0,
        deliveryDays: detail.deliveryDays ?? null,
        categoryId,
        aliexpressProductId,
        aliexpressPriceCents: aePriceCents,
        aliexpressCategoryId: detail.categoryId ?? null,
        variants: detail.variants.length
          ? {
              create: detail.variants.map((v) => ({
                label: v.label,
                optionName: v.optionName ?? null,
                skuAttr: v.skuAttr ?? null,
                priceCents: v.priceCents ?? null,
                stock: v.stock,
              })),
            }
          : undefined,
      },
    });
  }

  /** Slug lisible et unique (`sac-a-dos-randonnee-2`). */
  private async uniqueSlug(title: string): Promise<string> {
    const base = normalize(title)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'produit';
    let slug = base;
    let n = 1;
    // Boucle bornée : au-delà, on suffixe avec un aléatoire plutôt que de
    // marteler la base indéfiniment.
    while (n < 20) {
      const taken = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
      if (!taken) return slug;
      n++;
      slug = `${base}-${n}`;
    }
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
