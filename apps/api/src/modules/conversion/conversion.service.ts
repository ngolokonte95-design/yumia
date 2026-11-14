import { Injectable, Logger } from '@nestjs/common';
import { isOnTrial, type Plan } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

/** Événements que l'app peut déclarer. `subscribed` vient du webhook RevenueCat seul. */
export const CLIENT_EVENT_TYPES = ['limit_hit', 'paywall_view'] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

/** Une même limite atteinte en boucle ne compte qu'une fois par fenêtre. */
const DEDUPE_SECONDS = 10 * 60;
const DAY_MS = 86_400_000;

/**
 * Suivi de ce qui mène à l'abonnement — de quoi décider des limites du
 * Gratuit sur des chiffres, pas à l'aveugle : qui atteint quelle limite,
 * qui ouvre la page des forfaits, qui s'abonne, et ce que donne l'essai Gold.
 */
@Injectable()
export class ConversionService {
  private readonly logger = new Logger(ConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async record(userId: string, type: ClientEventType, detail?: string | null): Promise<void> {
    const clean = detail && /^[A-Za-z0-9_:-]{1,40}$/.test(detail) ? detail : null;
    try {
      const fresh = await this.redis.raw.set(
        `conversion:${userId}:${type}:${clean ?? '-'}`, '1', 'EX', DEDUPE_SECONDS, 'NX',
      );
      if (fresh !== 'OK') return;
    } catch {
      // Redis indisponible : on enregistre quand même, quitte à compter double.
    }
    await this.create(userId, type, clean);
  }

  /** Passage d'un forfait gratuit à un forfait payant (webhook RevenueCat). */
  async recordSubscribed(userId: string, plan: Plan): Promise<void> {
    await this.create(userId, 'subscribed', plan);
  }

  private async create(userId: string, type: string, detail: string | null): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, trialEndsAt: true },
      });
      if (!user) return;
      // Pour un abonnement, `plan` vient déjà d'être mis à jour : l'essai se
      // juge sur sa seule date.
      const onTrial = type === 'subscribed'
        ? !!user.trialEndsAt && user.trialEndsAt.getTime() > Date.now()
        : isOnTrial(user.plan, user.trialEndsAt);
      await this.prisma.conversionEvent.create({ data: { userId, type, detail, onTrial } });
    } catch (err) {
      this.logger.warn(`Événement ${type} non enregistré : ${(err as Error).message}`);
    }
  }

  /** Tableau de bord admin : la période des `days` derniers jours. */
  async stats(days = 7) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const events = this.prisma.conversionEvent;

    const [
      trialActive, trialStarted, trialEnded, trialConverted,
      subscribed, subscribedOnTrial,
      paywallViews, distinct, byFeature,
    ] = await Promise.all([
      this.prisma.user.count({ where: { plan: 'free', trialEndsAt: { gt: now } } }),
      this.prisma.user.count({ where: { trialEndsAt: { not: null }, createdAt: { gte: since } } }),
      this.prisma.user.count({ where: { trialEndsAt: { gte: since, lte: now } } }),
      this.prisma.user.count({ where: { trialEndsAt: { gte: since, lte: now }, plan: { not: 'free' } } }),
      events.count({ where: { type: 'subscribed', createdAt: { gte: since } } }),
      events.count({ where: { type: 'subscribed', onTrial: true, createdAt: { gte: since } } }),
      events.count({ where: { type: 'paywall_view', createdAt: { gte: since } } }),
      this.prisma.$queryRaw<Array<{ type: string; users: bigint }>>`
        SELECT "type", COUNT(DISTINCT "userId")::bigint AS users
        FROM "ConversionEvent"
        WHERE "createdAt" >= ${since} AND "type" IN ('paywall_view', 'limit_hit')
        GROUP BY "type"
      `,
      this.prisma.$queryRaw<Array<{ detail: string | null; hits: bigint; users: bigint }>>`
        SELECT "detail", COUNT(*)::bigint AS hits, COUNT(DISTINCT "userId")::bigint AS users
        FROM "ConversionEvent"
        WHERE "createdAt" >= ${since} AND "type" = 'limit_hit'
        GROUP BY "detail"
        ORDER BY users DESC, hits DESC
      `,
    ]);

    const usersOf = (t: string) => Number(distinct.find((r) => r.type === t)?.users ?? 0);
    return {
      days,
      trial: { active: trialActive, started: trialStarted, ended: trialEnded, converted: trialConverted },
      subscriptions: { total: subscribed, duringTrial: subscribedOnTrial },
      paywall: { views: paywallViews, users: usersOf('paywall_view') },
      limits: {
        users: usersOf('limit_hit'),
        byFeature: byFeature.map((r) => ({
          feature: r.detail ?? 'autre',
          hits: Number(r.hits),
          users: Number(r.users),
        })),
      },
    };
  }
}
