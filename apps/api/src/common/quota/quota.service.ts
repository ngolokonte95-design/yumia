import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { LIMITS_BY_PLAN, type LimitedFeature, type Plan } from '@yumia/shared';
import type { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { JwtPayload } from '../../modules/auth/types';

/**
 * Règle de quota posée sur une route par `@Quota`.
 *
 * - `feature` : quota du forfait de l'utilisateur, lu dans LIMITS_BY_PLAN —
 *   la même table que l'app, pour que le serveur ne bloque jamais avant elle.
 * - `margin` : ajouté à la limite quand la route sert aussi des écrans que
 *   l'app ne compte pas (l'Explorer charge un Top 3 à chaque ouverture,
 *   sur la même route que le dé Surprise).
 * - `scope` : sépare les compteurs d'un quota « par mode » ou « par univers ».
 * - `anonymousPerDay` : routes publiques, sans utilisateur connu. Compté par
 *   IP, donc volontairement large : plusieurs abonnés mobiles partagent
 *   souvent la même IP sortante.
 */
export interface QuotaRule {
  name: string;
  feature?: LimitedFeature;
  margin?: number;
  scope?: (req: Request) => string | undefined;
  anonymousPerDay?: number;
  /**
   * Plafond propre à la route, par forfait, quand elle n'a pas d'entrée dans
   * LIMITS_BY_PLAN (fonction bon marché que l'app ne compte pas, ex. la
   * traduction). Un forfait absent retombe sur `free`.
   */
  perDayByPlan?: Partial<Record<Plan, number>> & { free: number };
}

/** Durée de vie d'un compteur : la journée UTC, plus une marge. */
const TTL_SECONDS = 26 * 3600;

/**
 * Quotas quotidiens tenus par le serveur.
 *
 * Les compteurs de l'app vivent sur l'appareil : une réinstallation, ou un
 * appel direct à l'API, les contourne. Ce service est la serrure derrière
 * eux, sur les routes qui coûtent (modèle d'IA, fournisseur de lieux).
 *
 * Le jour est le jour UTC, comme côté app (`toISOString`). Seul un appel
 * RÉUSSI est compté : un échec ne doit pas consommer le quota.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Vérifie le quota avant l'appel. Renvoie la clé à incrémenter après
   * succès, ou `null` quand rien n'est à compter (illimité, Redis absent).
   */
  async assertAvailable(rule: QuotaRule, req: Request): Promise<string | null> {
    const user = (req as Request & { user?: JwtPayload }).user;
    const limit = user?.sub
      ? await this.limitFor(rule, user.sub)
      : rule.anonymousPerDay ?? Infinity;
    if (limit === Infinity) return null;

    const who = user?.sub ? `u:${user.sub}` : `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
    const scope = rule.scope?.(req);
    const day = new Date().toISOString().slice(0, 10);
    const key = `quota:${rule.name}${scope ? `:${scope}` : ''}:${who}:${day}`;

    let used: number;
    try {
      used = Number((await this.redis.raw.get(key)) ?? 0);
    } catch (err) {
      // Redis indisponible : on laisse passer. Bloquer tout l'app pour une
      // panne de cache serait pire que quelques appels non comptés.
      this.logger.warn(`Quota ${rule.name} non vérifié (Redis) : ${(err as Error).message}`);
      return null;
    }

    if (used >= limit) {
      throw new HttpException(
        {
          code: 'QUOTA_EXCEEDED',
          message: 'Tu as atteint la limite du jour pour ton forfait. Elle se réinitialise demain.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return key;
  }

  async consume(key: string): Promise<void> {
    try {
      const count = await this.redis.raw.incr(key);
      if (count === 1) await this.redis.raw.expire(key, TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Quota non incrémenté (${key}) : ${(err as Error).message}`);
    }
  }

  private async limitFor(rule: QuotaRule, userId: string): Promise<number> {
    if (!rule.feature && !rule.perDayByPlan) return rule.anonymousPerDay ?? Infinity;
    const user = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { plan: true } })
      .catch(() => null);
    const plan = (user?.plan ?? 'free') as Plan;
    if (!rule.feature && rule.perDayByPlan) {
      return rule.perDayByPlan[plan] ?? rule.perDayByPlan.free;
    }
    return LIMITS_BY_PLAN[plan][rule.feature!] + (rule.margin ?? 0);
  }
}
