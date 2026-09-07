/**
 * Client AliExpress Dropshipping (DS API).
 *
 * Deux styles de signature coexistent chez AliExpress et ne sont pas
 * interchangeables :
 *  - passerelle RPC `/sync`  → signature sur les paramètres triés (`sign`)
 *  - endpoints REST `/rest/*` → signature préfixée du chemin (`restSign`)
 * Les méthodes DS exigent en plus un `access_token` OAuth, obtenu une seule
 * fois via le consentement admin puis rafraîchi automatiquement.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';

const API_URL = 'https://api-sg.aliexpress.com/sync';
const REST_URL = 'https://api-sg.aliexpress.com/rest';
const OAUTH_URL = 'https://api-sg.aliexpress.com/oauth';

/** Marge appliquée au prix AliExpress pour obtenir le prix YUMIA. */
export const DEFAULT_MARGIN = 2.5;

/** Le jeton est renouvelé s'il expire dans moins de 10 minutes. */
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;

export interface AliExpressSearchResult {
  productId: string;
  title: string;
  /** Prix AliExpress en centimes (converti depuis leur montant décimal). */
  priceCents: number;
  imageUrl?: string;
  detailUrl?: string;
}

export interface AliExpressVariant {
  label: string;
  optionName?: string;
  skuAttr?: string;
  priceCents?: number;
  stock: number;
}

export interface AliExpressProductDetail {
  images: string[];
  videoUrl?: string;
  deliveryDays?: number;
  rating?: number;
  reviewsCount?: number;
  salesCount?: number;
  specifications: Array<{ name: string; value: string }>;
  description?: string;
  variants: AliExpressVariant[];
  categoryId?: number;
}

/** Convertit un montant décimal AliExpress ("12.34") en centimes entiers. */
function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

@Injectable()
export class AliExpressService {
  private readonly logger = new Logger(AliExpressService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get appKey(): string | undefined {
    return process.env.ALIEXPRESS_APP_KEY;
  }

  private get appSecret(): string | undefined {
    return process.env.ALIEXPRESS_APP_SECRET;
  }

  private get callbackUrl(): string {
    return process.env.ALIEXPRESS_CALLBACK_URL ?? 'https://api.yumia.eu/api/shop/aliexpress/callback';
  }

  isConfigured(): boolean {
    return !!this.appKey && !!this.appSecret;
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  /** URL de consentement à ouvrir une fois par l'admin pour lier le compte DS. */
  getAuthorizeUrl(state = 'yumia'): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.appKey ?? '',
      redirect_uri: this.callbackUrl,
      state,
      view: 'web',
      sp: 'ae',
    });
    return `${OAUTH_URL}/authorize?${params.toString()}`;
  }

  /** Signature REST : le chemin précède les paramètres triés. */
  private restSign(path: string, params: Record<string, string>): string {
    const sorted = path + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
    return createHmac('sha256', this.appSecret ?? '').update(sorted, 'utf8').digest('hex').toUpperCase();
  }

  private async callRest(path: string, extra: Record<string, string>): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      app_key: this.appKey ?? '',
      sign_method: 'sha256',
      timestamp: String(Date.now()),
      ...extra,
    };
    params['sign'] = this.restSign(path, params);
    const res = await fetch(`${REST_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  /** Échange le `code` du callback OAuth contre un jeton, et le persiste. */
  async exchangeCodeForToken(code: string): Promise<boolean> {
    const data = await this.callRest('/auth/token/create', { code });
    return this.saveToken(data);
  }

  private async saveToken(data: Record<string, unknown>): Promise<boolean> {
    const accessToken = data['access_token'] as string | undefined;
    if (!accessToken) {
      this.logger.error(`Échec de l'échange de jeton AliExpress : ${JSON.stringify(data)}`);
      return false;
    }
    // `expire_time` est un epoch en millisecondes, `expires_in` une durée en
    // secondes — AliExpress renvoie l'un ou l'autre selon l'endpoint.
    const raw = Number(data['expire_time'] ?? data['expires_in'] ?? 0);
    const expiresAt = raw > 10_000_000_000
      ? new Date(raw)
      : new Date(Date.now() + (raw || 86_400) * 1000);

    const existing = await this.prisma.aliExpressToken.findFirst();
    const payload = {
      accessToken,
      refreshToken: (data['refresh_token'] as string | undefined) ?? existing?.refreshToken ?? null,
      expiresAt,
    };
    if (existing) {
      await this.prisma.aliExpressToken.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.aliExpressToken.create({ data: payload });
    }
    return true;
  }

  /** Jeton valide, rafraîchi automatiquement s'il approche de l'expiration. */
  private async getAccessToken(): Promise<string | null> {
    const row = await this.prisma.aliExpressToken.findFirst();
    if (!row) return null;
    const stillValid = row.expiresAt && row.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_MARGIN_MS;
    if (stillValid || !row.refreshToken) return row.accessToken;

    const data = await this.callRest('/auth/token/refresh', { refresh_token: row.refreshToken });
    if (data['access_token']) {
      await this.saveToken(data);
      return data['access_token'] as string;
    }
    this.logger.warn(`Rafraîchissement du jeton AliExpress échoué : ${JSON.stringify(data)}`);
    return row.accessToken;
  }

  /** `true` si le compte dropshipping a été lié (consentement OAuth donné). */
  async isLinked(): Promise<boolean> {
    return (await this.prisma.aliExpressToken.count()) > 0;
  }

  // ── Passerelle RPC ────────────────────────────────────────────────────────

  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
    return createHmac('sha256', this.appSecret ?? '').update(sorted, 'utf8').digest('hex').toUpperCase();
  }

  private async call(method: string, extra: Record<string, string>): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      method,
      app_key: this.appKey ?? '',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      format: 'json',
      v: '2.0',
      sign_method: 'sha256',
      ...extra,
    };
    const token = await this.getAccessToken();
    if (token) params['access_token'] = token;
    params['sign'] = this.sign(params);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      this.logger.error(`Appel AliExpress [${method}] échoué : ${(e as Error).message}`);
      return {};
    }
  }

  // ── Catalogue ─────────────────────────────────────────────────────────────

  /** Recherche texte dans le catalogue dropshipping, normalisée en centimes EUR. */
  async search(keyword: string, page = 1, pageSize = 20): Promise<AliExpressSearchResult[]> {
    const data = await this.call('aliexpress.ds.text.search', {
      keyWord: keyword,
      pageIndex: String(page),
      pageSize: String(pageSize),
      targetCurrency: 'EUR',
      currency: 'EUR',
      targetLanguage: 'FR',
      local: 'fr_FR',
      shipToCountry: 'FR',
      countryCode: 'FR',
    });
    const response = data['aliexpress_ds_text_search_response'] as Record<string, any> | undefined;
    const products = response?.['data']?.['products']?.['selection_search_product'];
    if (!Array.isArray(products)) return [];
    return products
      .map((p: Record<string, unknown>) => ({
        productId: String(p['itemId'] ?? ''),
        title: String(p['title'] ?? ''),
        priceCents: toCents(p['targetSalePrice'] ?? p['targetOriginalPrice']),
        imageUrl: p['itemMainPic'] as string | undefined,
        detailUrl: p['itemUrl'] as string | undefined,
      }))
      .filter((p) => p.productId && p.title && p.priceCents > 0);
  }

  private async getRawDetail(productId: string): Promise<Record<string, any>> {
    const data = await this.call('aliexpress.ds.product.get', {
      product_id: productId,
      target_currency: 'EUR',
      target_language: 'FR',
      ship_to_country: 'FR',
    });
    const response = data['aliexpress_ds_product_get_response'] as Record<string, any> | undefined;
    return response?.['result'] ?? {};
  }

  /**
   * Fiche complète en un seul appel : toutes les images (et pas seulement la
   * vignette de recherche), variantes achetables, description du vendeur,
   * délai de livraison, note/avis/ventes et fiche technique.
   */
  async getProductDetail(productId: string, margin = DEFAULT_MARGIN): Promise<AliExpressProductDetail> {
    const detail = await this.getRawDetail(productId);

    const multimedia = detail['ae_multimedia_info_dto'] ?? {};
    const images = String(multimedia['image_urls'] ?? '')
      .split(';')
      .map((u: string) => u.trim())
      .filter(Boolean);

    const videos = multimedia['ae_video_dtos']?.['ae_video_d_t_o'];
    const videoUrl = Array.isArray(videos) ? videos[0]?.['media_url'] : videos?.['media_url'];

    const base = detail['ae_item_base_info_dto'] ?? {};
    const num = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const props = detail['ae_item_properties']?.['ae_item_property'];
    const specifications = Array.isArray(props)
      ? props
          .filter((p: Record<string, unknown>) => p['attr_name'] && p['attr_value'] && p['attr_value'] !== 'NONE')
          .map((p: Record<string, unknown>) => ({ name: String(p['attr_name']), value: String(p['attr_value']) }))
      : [];

    return {
      images,
      videoUrl: videoUrl as string | undefined,
      deliveryDays: num(detail['logistics_info_dto']?.['delivery_time']),
      rating: num(base['avg_evaluation_rating']),
      reviewsCount: num(base['evaluation_count']),
      salesCount: num(base['sales_count']),
      specifications,
      description: this.extractDescription(base['mobile_detail']),
      variants: this.extractVariants(detail, margin),
      categoryId: num(base['category_id']),
    };
  }

  /**
   * Description rédigée par le vendeur, extraite du blob `mobile_detail`
   * (liste de modules d'affichage). Une fiche contient souvent plusieurs
   * blocs texte (description, notes de taille, avertissements) : le plus long
   * est celui qui correspond réellement à la description.
   */
  private extractDescription(raw: unknown, maxLen = 600): string | undefined {
    if (!raw) return undefined;
    let modules: Array<Record<string, any>>;
    try {
      modules = JSON.parse(String(raw))?.moduleList ?? [];
    } catch {
      return undefined;
    }
    const notADescription = ['note', 'tableau', 'size note', 'size chart'];
    const texts = modules
      .filter((m) => m['type'] === 'text')
      .map((m) => String(m['data']?.['content'] ?? '').trim())
      .filter((t) => t && !notADescription.some((p) => t.toLowerCase().trimStart().startsWith(p)));
    if (!texts.length) return undefined;

    const text = texts.reduce((a, b) => (b.length > a.length ? b : a)).replace(/^Description:\s*\n?/i, '').trim();
    // Une fiche qui n'a que des blocs "note"/tableau de tailles n'a pas de
    // vraie description : mieux vaut un repli propre qu'un fragment inutile.
    if (text.length < 150) return undefined;
    return text.length > maxLen ? `${text.slice(0, maxLen).replace(/\s\S*$/, '')}…` : text;
  }

  /**
   * Variantes achetables, dédupliquées par valeur d'option. On conserve le
   * `sku_attr` exact : c'est lui qu'AliExpress réclame pour livrer LA bonne
   * déclinaison au moment de la commande.
   */
  private extractVariants(detail: Record<string, any>, margin: number): AliExpressVariant[] {
    const skus = detail['ae_item_sku_info_dtos']?.['ae_item_sku_info_d_t_o'];
    if (!Array.isArray(skus)) return [];

    const byLabel = new Map<string, AliExpressVariant>();
    for (const sku of skus) {
      const props = sku['ae_sku_property_dtos']?.['ae_sku_property_d_t_o'];
      if (!Array.isArray(props) || !props.length) continue;
      const prop = props[0];
      const label = String(prop['sku_property_value'] ?? '').trim();
      if (!label) continue;

      const stock = Number(sku['sku_available_stock'] ?? 0) || 0;
      const existing = byLabel.get(label);
      // Une même valeur (ex. "Rouge") existe en plusieurs SKU (combinaisons de
      // tailles) : on garde en priorité une déclinaison réellement en stock.
      if (existing && existing.stock > 0 && stock === 0) continue;

      const aePrice = toCents(sku['offer_sale_price'] ?? sku['sku_price']);
      byLabel.set(label, {
        label,
        optionName: prop['sku_property_name'] ? String(prop['sku_property_name']) : undefined,
        skuAttr: String(sku['sku_attr'] ?? sku['id'] ?? '') || undefined,
        priceCents: aePrice ? Math.round(aePrice * margin) : undefined,
        stock,
      });
    }
    return [...byLabel.values()];
  }

  // ── Commande ──────────────────────────────────────────────────────────────

  /**
   * Transmet la commande à AliExpress après confirmation du paiement Stripe.
   * Renvoie l'identifiant de commande AliExpress, ou `null` en cas d'échec
   * (la commande YUMIA reste alors en `paid` pour reprise manuelle plutôt que
   * d'être marquée expédiée à tort).
   */
  async placeOrder(params: {
    outOrderId: string;
    address: {
      fullName: string;
      line1: string;
      line2?: string | null;
      city: string;
      postalCode: string;
      countryCode: string;
      phone: string;
    };
    items: Array<{ aliexpressProductId: string; quantity: number; skuAttr?: string | null }>;
  }): Promise<string | null> {
    if (!params.items.length) return null;

    const data = await this.call('aliexpress.ds.order.create', {
      param_place_order_request4_open_api_d_t_o: JSON.stringify({
        out_order_id: params.outOrderId,
        logistics_address: {
          full_name: params.address.fullName,
          address: params.address.line1,
          address2: params.address.line2 ?? '',
          city: params.address.city,
          zip: params.address.postalCode,
          country: params.address.countryCode,
          mobile_no: params.address.phone,
          contact_person: params.address.fullName,
        },
        product_items: params.items.map((i) => ({
          product_id: i.aliexpressProductId,
          product_count: i.quantity,
          sku_attr: i.skuAttr ?? '',
        })),
      }),
    });

    const result = (data['aliexpress_ds_order_create_response'] as Record<string, any> | undefined)?.['result'];
    if (result?.['is_success']) {
      const orderId = String(result['order_id'] ?? '');
      this.logger.log(`Commande AliExpress passée : ${orderId} (commande YUMIA ${params.outOrderId})`);
      return orderId || null;
    }
    this.logger.error(`Commande AliExpress refusée pour ${params.outOrderId} : ${JSON.stringify(result ?? data)}`);
    return null;
  }
}
