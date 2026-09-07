/**
 * Panier persistant (un par utilisateur).
 *
 * Les prix ne sont jamais stockés dans le panier : ils sont relus depuis le
 * catalogue à chaque affichage. Un panier qui garderait un prix figé pendant
 * des semaines facturerait un montant obsolète — le prix ne se fige qu'au
 * moment de la commande (voir OrderItem).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Frais de port forfaitaires, offerts au-delà d'un seuil. */
export const SHIPPING_FLAT_CENTS = 490;
export const FREE_SHIPPING_THRESHOLD_CENTS = 4900;

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  skuAttr: string | null;
  title: string;
  slug: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  available: boolean;
  aliexpressProductId: string | null;
}

export interface CartSummary {
  lines: CartLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  itemsCount: number;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findUnique({ where: { userId } });
    return existing ?? this.prisma.cart.create({ data: { userId } });
  }

  async getCart(userId: string): Promise<CartSummary> {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      orderBy: { createdAt: 'asc' },
      include: {
        product: { select: { id: true, slug: true, title: true, images: true, priceCents: true, currency: true, status: true, aliexpressProductId: true } },
        variant: { select: { id: true, label: true, skuAttr: true, priceCents: true, stock: true } },
      },
    });

    const lines: CartLine[] = items.map((i) => {
      // Le prix de la variante prime quand elle en a un (les déclinaisons
      // AliExpress varient légèrement selon taille/couleur).
      const unitPriceCents = i.variant?.priceCents ?? i.product.priceCents;
      return {
        id: i.id,
        productId: i.product.id,
        variantId: i.variant?.id ?? null,
        variantLabel: i.variant?.label ?? null,
        skuAttr: i.variant?.skuAttr ?? null,
        title: i.product.title,
        slug: i.product.slug,
        imageUrl: i.product.images[0] ?? null,
        quantity: i.quantity,
        unitPriceCents,
        lineTotalCents: unitPriceCents * i.quantity,
        available: i.product.status === 'active' && (!i.variant || i.variant.stock > 0),
        aliexpressProductId: i.product.aliexpressProductId,
      };
    });

    // Un article indisponible reste visible (pour que l'utilisateur comprenne
    // pourquoi son total a changé) mais ne compte pas dans le montant.
    const subtotalCents = lines.filter((l) => l.available).reduce((s, l) => s + l.lineTotalCents, 0);
    const shippingCents = subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS;

    return {
      lines,
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
      currency: items[0]?.product.currency ?? 'EUR',
      itemsCount: lines.filter((l) => l.available).reduce((s, l) => s + l.quantity, 0),
    };
  }

  async addItem(userId: string, productId: string, variantId?: string, quantity = 1): Promise<CartSummary> {
    const qty = Math.min(20, Math.max(1, Math.round(quantity)));
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
    if (!product) throw new NotFoundException('Produit introuvable');
    if (product.status !== 'active') throw new BadRequestException('Produit indisponible');

    if (variantId) {
      const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (!variant || variant.productId !== productId) throw new BadRequestException('Déclinaison invalide pour ce produit');
    }

    const cart = await this.getOrCreateCart(userId);
    // Pas d'upsert sur la contrainte d'unicité : en PostgreSQL, deux NULL sont
    // considérés comme distincts, donc (cartId, productId, NULL) ne dédoublonne
    // PAS les produits sans déclinaison — chaque ajout créerait une ligne de
    // plus au lieu d'incrémenter. On cherche donc la ligne explicitement.
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId, variantId: variantId ?? null },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: { increment: qty } } });
    } else {
      await this.prisma.cartItem.create({ data: { cartId: cart.id, productId, variantId: variantId ?? null, quantity: qty } });
    }
    return this.getCart(userId);
  }

  /** Quantité à 0 → l'article est retiré. */
  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<CartSummary> {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id }, select: { id: true } });
    if (!item) throw new NotFoundException('Article introuvable dans le panier');

    const qty = Math.min(20, Math.round(quantity));
    if (qty <= 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity: qty } });
    }
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartSummary> {
    return this.updateQuantity(userId, itemId, 0);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, select: { id: true } });
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }
}
