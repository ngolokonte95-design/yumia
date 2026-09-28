import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MailerService } from '../mailer/mailer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AliExpressService, type AliExpressOrderStatus } from './aliexpress.service';

/**
 * Où en est une commande AliExpress, vu de YUMIA.
 *
 * Constat du 28/09/2026 (YUM-E2EE26) : une commande créée par l'API reste
 * « à payer » chez AliExpress — le revendeur la règle À LA MAIN dans son
 * compte, aucune API ne le fait (même DSers renvoie vers « Pay now ») — et,
 * faute de paiement, AliExpress l'annule (PAYMENT_TIMEOUT_BUYER). YUMIA la
 * marquait pourtant « expédiée » dès la création.
 */
export type OrderStage = 'awaiting_payment' | 'cancelled' | 'preparing' | 'shipped' | 'delivered' | 'unknown';

export function stageOf(s: AliExpressOrderStatus): OrderStage {
  switch (s.status) {
    case 'PLACE_ORDER_SUCCESS':
      return 'awaiting_payment';
    case 'IN_CANCEL':
      return 'cancelled';
    case 'RISK_CONTROL':
    case 'FUND_PROCESSING':
    case 'WAIT_SELLER_EXAMINE_MONEY':
    case 'WAIT_SELLER_SEND_GOODS':
      return 'preparing';
    case 'SELLER_PART_SEND_GOODS':
    case 'WAIT_BUYER_ACCEPT_GOODS':
      return 'shipped';
    case 'FINISH':
      // Close : livrée, ou annulée sans livraison (motif présent, aucun transport).
      if (s.logisticsStatus === 'BUYER_ACCEPT_GOODS' || s.trackingNumber) return 'delivered';
      return s.endReason ? 'cancelled' : 'unknown';
    default:
      return s.logisticsStatus === 'SELLER_SEND_GOODS' ? 'shipped' : 'unknown';
  }
}

/**
 * Étape d'une commande YUMIA passée à plusieurs vendeurs : la MOINS avancée
 * l'emporte, et une annulation ou un paiement manquant passe avant tout —
 * c'est ce qui demande une action.
 */
export function combinedStage(stages: OrderStage[]): OrderStage {
  const priority: OrderStage[] = ['cancelled', 'awaiting_payment', 'unknown', 'preparing', 'shipped', 'delivered'];
  return priority.find((p) => stages.includes(p)) ?? 'unknown';
}

/** Page de suivi multi-transporteurs, lisible sans compte. */
export function trackingUrlFor(trackingNumber: string): string {
  return `https://t.17track.net/fr#nums=${encodeURIComponent(trackingNumber)}`;
}

/** Page de la commande dans le compte AliExpress, avec le bouton « Payer ». */
export function aliexpressOrderUrl(aliexpressOrderId: string): string {
  return `https://www.aliexpress.com/p/order/detail.html?orderId=${encodeURIComponent(aliexpressOrderId)}`;
}

/** Onglets de l'écran admin des commandes. */
export type AdminOrdersTab = 'in_progress' | 'to_transmit' | 'shipped' | 'delivered' | 'all';

/** Délai entre deux rappels de paiement pour une même commande. */
const PAY_REMINDER_EVERY_SECONDS = 6 * 3600;

@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliexpress: AliExpressService,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Prévient les administrateurs qu'une commande attend d'être payée chez
   * AliExpress (notification + e-mail), au plus toutes les 6 h par commande.
   */
  async alertPaymentNeeded(reference: string, aliexpressOrderId: string, amount: string | null, force = false): Promise<void> {
    const key = `shop:pay-reminder:${aliexpressOrderId}`;
    if (!force) {
      const fresh = await this.redis.raw.set(key, '1', 'EX', PAY_REMINDER_EVERY_SECONDS, 'NX').catch(() => 'OK');
      if (fresh !== 'OK') return;
    } else {
      await this.redis.raw.set(key, '1', 'EX', PAY_REMINDER_EVERY_SECONDS).catch(() => undefined);
    }
    const url = aliexpressOrderUrl(aliexpressOrderId);
    await this.alertAdmins(
      '💳 Commande AliExpress à payer',
      `${reference}${amount ? ` · ${amount}` : ''} — à régler dans ton compte AliExpress, sinon elle est annulée.`,
      `La commande ${reference} a été passée chez AliExpress (n° ${aliexpressOrderId})${amount ? ` pour ${amount}` : ''}.\n\n` +
        `Elle ne partira qu'une fois payée : ouvre-la et appuie sur « Payer » :\n${url}\n\n` +
        'Sans paiement, AliExpress l\'annule automatiquement.',
      { url },
    );
  }

  /** Toutes les 2 h : état AliExpress des commandes en cours. */
  @Cron('15 */2 * * *', { name: 'shop-order-sync', timeZone: 'UTC' })
  async syncAll(): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['fulfilling', 'shipped'] },
        aliexpressOrderId: { not: null },
        createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
      },
      select: { id: true, reference: true, userId: true, status: true, aliexpressOrderId: true, trackingNumber: true, shippedAt: true },
    });
    for (const order of orders) {
      await this.syncOne(order).catch((e) =>
        this.logger.error(`Synchro ${order.reference} échouée : ${(e as Error).message}`),
      );
    }
  }

  async syncOne(order: {
    id: string;
    reference: string;
    userId: string | null;
    status: string;
    aliexpressOrderId: string | null;
    trackingNumber: string | null;
    shippedAt: Date | null;
  }): Promise<OrderStage> {
    const ids = (order.aliexpressOrderId ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const states = (await Promise.all(ids.map((id) => this.aliexpress.getOrderStatus(id)))).filter(
      (s): s is AliExpressOrderStatus => s !== null,
    );
    if (states.length !== ids.length || !ids.length) return 'unknown';

    const stage = combinedStage(states.map(stageOf));
    const tracking = states.find((s) => s.trackingNumber)?.trackingNumber ?? null;

    switch (stage) {
      case 'awaiting_payment': {
        if (order.status !== 'fulfilling') await this.setStatus(order.id, { status: 'fulfilling', shippedAt: null });
        for (const [k, s] of states.entries()) {
          if (s.status === 'PLACE_ORDER_SUCCESS') await this.alertPaymentNeeded(order.reference, ids[k], s.amount);
        }
        break;
      }
      case 'cancelled': {
        // Retour en « payée » : le client a payé, la commande est à repasser
        // (retry-order), et surtout plus affichée comme expédiée.
        await this.setStatus(order.id, { status: 'paid', aliexpressOrderId: null, shippedAt: null });
        const reason = states.find((s) => s.endReason)?.endReason ?? 'motif inconnu';
        await this.alertAdmins(
          '⚠️ Commande AliExpress annulée',
          `${order.reference} annulée chez AliExpress (${reason}) — à repasser.`,
          `La commande ${order.reference} a été annulée chez AliExpress (${reason}).\n` +
            'Le client a payé : elle est repassée en « payée » dans YUMIA.\n\n' +
            `Pour la retransmettre : node dist/scripts/retry-order.js ${order.reference} --envoyer`,
        );
        this.logger.warn(`Commande ${order.reference} annulée chez AliExpress (${reason}) — repassée en paid`);
        break;
      }
      case 'preparing':
        if (order.status !== 'fulfilling') await this.setStatus(order.id, { status: 'fulfilling', shippedAt: null });
        break;
      case 'shipped': {
        const newTracking = tracking && tracking !== order.trackingNumber;
        await this.setStatus(order.id, {
          status: 'shipped',
          shippedAt: order.shippedAt ?? new Date(),
          ...(newTracking ? { trackingNumber: tracking, trackingUrl: trackingUrlFor(tracking) } : {}),
        });
        if (order.status !== 'shipped' || newTracking) {
          await this.notifyCustomer(
            order.userId,
            '📦 Ta commande est en route',
            `${order.reference}${tracking ? ` · suivi ${tracking}` : ''} — suis ton colis depuis « Mes commandes ».`,
          );
        }
        break;
      }
      case 'delivered':
        await this.setStatus(order.id, {
          status: 'delivered',
          ...(tracking && tracking !== order.trackingNumber ? { trackingNumber: tracking, trackingUrl: trackingUrlFor(tracking) } : {}),
        });
        await this.notifyCustomer(order.userId, '✅ Commande livrée', `${order.reference} est arrivée. Bonne découverte !`);
        break;
      default:
        this.logger.warn(`Commande ${order.reference} : état AliExpress non reconnu (${states.map((s) => s.status).join(', ')})`);
    }
    return stage;
  }

  // ── Administration ──────────────────────────────────────────────────────

  /** Commandes pour l'écran admin, par onglet. */
  async adminList(tab: AdminOrdersTab) {
    const where =
      tab === 'in_progress' ? { status: 'fulfilling' as const }
      : tab === 'to_transmit' ? { status: 'paid' as const }
      : tab === 'shipped' ? { status: 'shipped' as const }
      : tab === 'delivered' ? { status: 'delivered' as const }
      : { status: { notIn: ['pending' as const] } };
    const [orders, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true, reference: true, status: true, totalCents: true, currency: true, createdAt: true,
          aliexpressOrderId: true, trackingNumber: true,
          user: { select: { displayName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.groupBy({ by: ['status'], where: { status: { not: 'pending' } }, _count: { _all: true } }),
    ]);
    const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    return {
      counts: {
        in_progress: count('fulfilling'),
        to_transmit: count('paid'),
        shipped: count('shipped'),
        delivered: count('delivered'),
      },
      orders: orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        totalCents: o.totalCents,
        currency: o.currency,
        createdAt: o.createdAt,
        itemCount: o._count.items,
        customer: o.user?.displayName ?? null,
        transmitted: !!o.aliexpressOrderId,
        trackingNumber: o.trackingNumber,
      })),
    };
  }

  /**
   * Détail d'une commande, avec l'état EN DIRECT de chaque commande
   * AliExpress : c'est là qu'on voit si elle attend encore d'être payée.
   */
  async adminDetail(reference: string) {
    const order = await this.prisma.order.findUnique({
      where: { reference },
      include: { items: true, user: { select: { displayName: true, email: true } } },
    });
    if (!order) return null;
    const ids = (order.aliexpressOrderId ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const aliexpress = await Promise.all(
      ids.map(async (id) => {
        const state = await this.aliexpress.getOrderStatus(id).catch(() => null);
        return {
          id,
          url: aliexpressOrderUrl(id),
          stage: state ? stageOf(state) : ('unknown' as OrderStage),
          status: state?.status ?? null,
          endReason: state?.endReason ?? null,
          amount: state?.amount ?? null,
          trackingNumber: state?.trackingNumber ?? null,
          carrier: state?.carrier ?? null,
        };
      }),
    );
    return {
      reference: order.reference,
      status: order.status,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      currency: order.currency,
      customer: order.user ? { name: order.user.displayName, email: order.user.email } : null,
      address: order.addressSnapshot,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      items: order.items.map((i) => ({
        title: i.titleSnapshot,
        image: i.imageSnapshot,
        variant: i.variantLabel,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        aliexpressProductId: i.aliexpressProductId,
      })),
      aliexpress,
    };
  }

  /** « Actualiser » : la synchro d'une seule commande, tout de suite. */
  async adminSync(reference: string): Promise<OrderStage | null> {
    const order = await this.prisma.order.findUnique({
      where: { reference },
      select: { id: true, reference: true, userId: true, status: true, aliexpressOrderId: true, trackingNumber: true, shippedAt: true },
    });
    if (!order) return null;
    if (!order.aliexpressOrderId) return 'unknown';
    return this.syncOne(order);
  }

  private setStatus(id: string, data: Record<string, unknown>) {
    return this.prisma.order.update({ where: { id }, data });
  }

  private async notifyCustomer(userId: string | null, title: string, body: string): Promise<void> {
    if (!userId) return;
    await this.notifications.sendToUser(userId, title, body, { route: '/shop/orders' }).catch(() => undefined);
  }

  /** Notification aux comptes administrateurs (ADMIN_EMAILS) + e-mail. */
  private async alertAdmins(title: string, body: string, mailText: string, data?: Record<string, unknown>): Promise<void> {
    const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    this.logger.warn(`${title} — ${body}`);
    if (!emails.length) return;
    const admins = await this.prisma.user.findMany({
      where: { email: { in: emails, mode: 'insensitive' } },
      select: { id: true },
    });
    await Promise.all(admins.map((a) => this.notifications.sendToUser(a.id, title, body, data).catch(() => undefined)));
    await this.mailer.sendAdminAlert(emails, `[YUMIA] ${title}`, mailText).catch((e) =>
      this.logger.error(`E-mail d'alerte non envoyé : ${(e as Error).message}`),
    );
  }
}
