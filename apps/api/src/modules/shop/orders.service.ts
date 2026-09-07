/**
 * Commandes : checkout Stripe puis transmission automatique à AliExpress.
 *
 * Enchaînement volontairement en deux temps, avec le webhook Stripe comme
 * seule source de vérité du paiement :
 *   1. checkout()      → commande `pending` + PaymentIntent (montants
 *                        recalculés côté serveur, jamais reçus du client)
 *   2. webhook Stripe  → `paid`, puis commande passée chez AliExpress
 *
 * Un échec côté AliExpress laisse la commande en `paid` (jamais `shipped`) :
 * le client a payé, la commande est reprenable manuellement, rien n'est
 * annoncé comme expédié à tort.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AliExpressService } from './aliexpress.service';
import { CartService } from './cart.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly aliexpress: AliExpressService,
  ) {}

  private get stripe(): Stripe {
    if (!this.stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new BadRequestException('Paiement indisponible (Stripe non configuré)');
      this.stripeClient = new Stripe(key);
    }
    return this.stripeClient;
  }

  isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  /** Référence courte lisible par le client (YUM-XXXXXX). */
  private newReference(): string {
    return `YUM-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  // ── Adresses ──────────────────────────────────────────────────────────────

  async listAddresses(userId: string) {
    return this.prisma.shippingAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, data: {
    fullName: string; line1: string; line2?: string; city: string;
    postalCode: string; countryCode?: string; phone: string; isDefault?: boolean;
  }) {
    // Une seule adresse par défaut à la fois.
    if (data.isDefault) {
      await this.prisma.shippingAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const count = await this.prisma.shippingAddress.count({ where: { userId } });
    return this.prisma.shippingAddress.create({
      data: {
        userId,
        fullName: data.fullName,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: data.countryCode ?? 'FR',
        phone: data.phone,
        // La première adivresse enregistrée devient celle par défaut d'office.
        isDefault: data.isDefault ?? count === 0,
      },
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.prisma.shippingAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Adresse introuvable');
    await this.prisma.shippingAddress.delete({ where: { id: address.id } });
    return { ok: true };
  }

  // ── Checkout ──────────────────────────────────────────────────────────────

  /**
   * Crée la commande et le PaymentIntent. Le montant est TOUJOURS recalculé
   * depuis le panier côté serveur : un total transmis par le client serait
   * manipulable.
   */
  async checkout(userId: string, addressId: string) {
    const address = await this.prisma.shippingAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Adresse de livraison introuvable');

    const summary = await this.cart.getCart(userId);
    const buyable = summary.lines.filter((l) => l.available);
    if (!buyable.length) throw new BadRequestException('Panier vide ou articles indisponibles');

    const order = await this.prisma.order.create({
      data: {
        reference: this.newReference(),
        userId,
        status: 'pending',
        subtotalCents: summary.subtotalCents,
        shippingCents: summary.shippingCents,
        totalCents: summary.totalCents,
        currency: summary.currency,
        addressId: address.id,
        addressSnapshot: {
          fullName: address.fullName,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          postalCode: address.postalCode,
          countryCode: address.countryCode,
          phone: address.phone,
        },
        items: {
          create: buyable.map((l) => ({
            productId: l.productId,
            titleSnapshot: l.title,
            imageSnapshot: l.imageUrl,
            variantLabel: l.variantLabel,
            skuAttr: l.skuAttr,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            aliexpressProductId: l.aliexpressProductId,
          })),
        },
      },
    });

    const intent = await this.stripe.paymentIntents.create({
      amount: order.totalCents,
      currency: order.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // `orderId` est ce qui relie le webhook à la commande : sans lui, un
      // paiement confirmé serait impossible à rattacher.
      metadata: { orderId: order.id, reference: order.reference, userId },
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: intent.id },
    });

    return {
      orderId: order.id,
      reference: order.reference,
      totalCents: order.totalCents,
      currency: order.currency,
      clientSecret: intent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    };
  }

  /**
   * Webhook Stripe : signature vérifiée puis paiement confirmé.
   * La vérification de signature est indispensable — sans elle, n'importe qui
   * pourrait marquer des commandes comme payées en appelant cette route.
   */
  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET non configuré');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (e) {
      throw new BadRequestException(`Signature Stripe invalide : ${(e as Error).message}`);
    }

    if (event.type !== 'payment_intent.succeeded') return;

    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.['orderId'];
    if (!orderId) {
      this.logger.warn(`PaymentIntent ${intent.id} sans orderId dans les metadata — ignoré`);
      return;
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) {
      this.logger.error(`Commande ${orderId} introuvable pour le PaymentIntent ${intent.id}`);
      return;
    }
    // Stripe peut rejouer un webhook : sans ce garde-fou, la commande serait
    // transmise deux fois à AliExpress.
    if (order.status !== 'pending') return;

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await this.cart.clear(order.userId);

    await this.fulfill(order.id);
  }

  /** Transmet la commande payée à AliExpress. */
  async fulfill(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'paid') return;

    const items = order.items
      .filter((i) => i.aliexpressProductId)
      .map((i) => ({ aliexpressProductId: i.aliexpressProductId!, quantity: i.quantity, skuAttr: i.skuAttr }));

    if (!items.length) {
      this.logger.warn(`Commande ${order.reference} sans article AliExpress — expédition manuelle requise`);
      return;
    }

    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'fulfilling' } });

    const address = order.addressSnapshot as Record<string, string>;
    const aliexpressOrderId = await this.aliexpress.placeOrder({
      outOrderId: order.reference,
      address: {
        fullName: address['fullName'] ?? '',
        line1: address['line1'] ?? '',
        line2: address['line2'] ?? null,
        city: address['city'] ?? '',
        postalCode: address['postalCode'] ?? '',
        countryCode: address['countryCode'] ?? 'FR',
        phone: address['phone'] ?? '',
      },
      items,
    });

    if (aliexpressOrderId) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: 'shipped', shippedAt: new Date(), aliexpressOrderId },
      });
      // Les ventes affichées sur la fiche produit reflètent les ventes réelles.
      await Promise.all(order.items.filter((i) => i.productId).map((i) =>
        this.prisma.product.update({ where: { id: i.productId! }, data: { salesCount: { increment: i.quantity } } }),
      ));
    } else {
      // Retour en `paid` : le paiement est acquis, la transmission a échoué et
      // devra être reprise — surtout ne pas laisser la commande en `fulfilling`
      // (état transitoire) ni la marquer expédiée.
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'paid' } });
      this.logger.error(`Commande ${order.reference} payée mais non transmise à AliExpress — reprise manuelle nécessaire`);
    }
  }

  // ── Consultation ──────────────────────────────────────────────────────────

  async listOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId, status: { not: 'pending' } },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }
}
