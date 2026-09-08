/**
 * Catalogue : rayons, listing filtré/trié, fiche produit, wishlist, avis.
 * Lecture seule côté client — l'alimentation passe par ShopImportService.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { effectiveMargin } from './aliexpress.service';

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'bestsellers';

export interface ProductListQuery {
  categorySlug?: string;
  /** Recherche plein texte sur le titre. */
  q?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  minRating?: number;
  /** Livraison estimée à J+`maxDeliveryDays` au plus. */
  maxDeliveryDays?: number;
  featuredOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

/** Champs renvoyés dans les listes — volontairement sans description ni specs. */
const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  priceCents: true,
  compareAtCents: true,
  currency: true,
  images: true,
  rating: true,
  reviewsCount: true,
  salesCount: true,
  deliveryDays: true,
  featured: true,
  category: { select: { slug: true, nameFr: true, emoji: true } },
} satisfies Prisma.ProductSelect;

const ACTIVE: ProductStatus[] = ['active', 'out_of_stock'];

/**
 * Champs jamais renvoyés à un client ordinaire : ce sont nos conditions
 * d'achat. `getProduct` utilisait un `include`, qui remonte TOUS les scalaires
 * du modèle — le prix payé chez le fournisseur partait donc dans la réponse de
 * chaque fiche produit.
 */
const COST_FIELDS = ['aliexpressPriceCents', 'aliexpressProductId', 'aliexpressCategoryId'] as const;

/** Marge sur un produit, telle qu'affichée à l'admin. */
export interface AdminMargin {
  costCents: number;
  marginCents: number;
  /** Part de marge dans le prix de vente, en pourcentage (arrondi au dixième). */
  marginPercent: number;
  /** Coefficient appliqué au prix d'achat (3 sur les petits prix, 2 sur les gros). */
  multiplier: number;
}

export function adminMargin(priceCents: number, costCents: number | null): AdminMargin | null {
  if (costCents == null || costCents <= 0) return null;
  const marginCents = priceCents - costCents;
  return {
    costCents,
    marginCents,
    marginPercent: priceCents > 0 ? Math.round((marginCents / priceCents) * 1000) / 10 : 0,
    multiplier: Math.round(effectiveMargin(costCents) * 100) / 100,
  };
}

/** Retire les conditions d'achat, ou les convertit en marge si l'appelant est admin. */
function forAudience<T extends Record<string, unknown>>(
  product: T,
  isAdmin: boolean,
): T & { adminMargin?: AdminMargin | null } {
  const clean = { ...product } as Record<string, unknown>;
  const cost = typeof product.aliexpressPriceCents === 'number' ? product.aliexpressPriceCents : null;
  for (const f of COST_FIELDS) delete clean[f];
  if (!isAdmin) return clean as T;
  return {
    ...clean,
    adminMargin: adminMargin(Number(product.priceCents ?? 0), cost),
  } as T & { adminMargin: AdminMargin | null };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rayons actifs, ordonnés — alimente la navigation de la boutique. */
  async listCategories() {
    const categories = await this.prisma.shopCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, slug: true, nameFr: true, emoji: true, universe: true, parentId: true,
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameFr: c.nameFr,
      emoji: c.emoji,
      universe: c.universe,
      parentId: c.parentId,
      productsCount: c._count.products,
    }));
  }

  /** Rayon correspondant à un univers YUMIA (produits en contexte sur une fiche lieu). */
  async categoryForUniverse(universe: string) {
    return this.prisma.shopCategory.findFirst({
      where: { universe: universe as never, isActive: true },
      select: { id: true, slug: true, nameFr: true, emoji: true },
    });
  }

  async listProducts(query: ProductListQuery, isAdmin = false) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.ProductWhereInput = {
      status: { in: ACTIVE },
      ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.featuredOnly ? { featured: true } : {}),
      ...(query.minPriceCents != null || query.maxPriceCents != null
        ? { priceCents: { ...(query.minPriceCents != null ? { gte: query.minPriceCents } : {}), ...(query.maxPriceCents != null ? { lte: query.maxPriceCents } : {}) } }
        : {}),
      ...(query.minRating != null ? { rating: { gte: query.minRating } } : {}),
      ...(query.maxDeliveryDays != null ? { deliveryDays: { lte: query.maxDeliveryDays } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        // Le prix d'achat n'est même pas lu quand l'appelant n'est pas admin :
        // ce qui ne sort pas de la base ne peut pas fuiter par mégarde.
        select: isAdmin ? { ...LIST_SELECT, aliexpressPriceCents: true } : LIST_SELECT,
        orderBy: this.orderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const items = rows.map((p) => forAudience(p, isAdmin));
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  private orderBy(sort?: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':   return [{ priceCents: 'asc' }];
      case 'price_desc':  return [{ priceCents: 'desc' }];
      case 'rating':      return [{ rating: 'desc' }, { reviewsCount: 'desc' }];
      case 'newest':      return [{ createdAt: 'desc' }];
      case 'bestsellers': return [{ salesCount: 'desc' }];
      // Par défaut : les produits mis en avant d'abord, puis les mieux vendus —
      // une liste triée par date seule remonterait surtout des imports récents
      // non éprouvés.
      default:            return [{ featured: 'desc' }, { salesCount: 'desc' }, { rating: 'desc' }];
    }
  }

  /** Fiche produit complète + suggestions du même rayon. */
  async getProduct(slug: string, userId?: string, isAdmin = false) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: { select: { slug: true, nameFr: true, emoji: true } },
        variants: { orderBy: { label: 'asc' } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, displayName: true, photoUrl: true } } },
        },
      },
    });
    if (!product || product.status === 'archived' || product.status === 'draft') {
      throw new NotFoundException('Produit introuvable');
    }

    const [related, wishlisted] = await Promise.all([
      this.prisma.product.findMany({
        where: { categoryId: product.categoryId, status: { in: ACTIVE }, NOT: { id: product.id } },
        select: isAdmin ? { ...LIST_SELECT, aliexpressPriceCents: true } : LIST_SELECT,
        orderBy: [{ salesCount: 'desc' }],
        take: 8,
      }),
      userId
        ? this.prisma.wishlistItem.findUnique({
            where: { userId_productId: { userId, productId: product.id } },
            select: { id: true },
          })
        : null,
    ]);

    return {
      ...forAudience(product, isAdmin),
      related: related.map((p) => forAudience(p, isAdmin)),
      isWishlisted: !!wishlisted,
    };
  }

  // ── Wishlist ──────────────────────────────────────────────────────────────

  async listWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: LIST_SELECT } },
    });
    return items.map((i) => i.product);
  }

  /** Ajoute/retire de la wishlist — renvoie l'état résultant. */
  async toggleWishlist(userId: string, productId: string): Promise<{ wishlisted: boolean }> {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing) {
      await this.prisma.wishlistItem.delete({ where: { id: existing.id } });
      return { wishlisted: false };
    }
    await this.prisma.wishlistItem.create({ data: { userId, productId } });
    return { wishlisted: true };
  }

  // ── Avis ──────────────────────────────────────────────────────────────────

  /**
   * Dépose ou met à jour l'avis de l'utilisateur, puis recalcule la note
   * agrégée du produit. Réservé aux acheteurs : sans commande livrée, un avis
   * n'a aucune valeur et ouvre la porte au spam.
   */
  async upsertReview(userId: string, productId: string, rating: number, comment?: string) {
    const bought = await this.prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: { in: ['paid', 'fulfilling', 'shipped', 'delivered'] } } },
      select: { id: true },
    });
    if (!bought) throw new NotFoundException('Seuls les acheteurs peuvent laisser un avis');

    const clamped = Math.min(5, Math.max(1, Math.round(rating)));
    await this.prisma.productReview.upsert({
      where: { productId_userId: { productId, userId } },
      create: { productId, userId, rating: clamped, comment: comment ?? null },
      update: { rating: clamped, comment: comment ?? null },
    });

    const agg = await this.prisma.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.product.update({
      where: { id: productId },
      data: { rating: agg._avg.rating ?? null, reviewsCount: agg._count._all },
    });

    return { rating: clamped };
  }
}
