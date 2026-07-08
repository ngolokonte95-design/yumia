import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, VisitFeedback } from '@prisma/client';
import {
  BADGES,
  PLAN_LIMITS,
  levelForXp,
  type Badge,
} from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

const VISIT_IDEM_TTL_SECONDS = 30;
const HEATMAP_CACHE_TTL_SECONDS = 5 * 60; // 5 min — scan des 90 derniers jours
const UNIVERSE_CACHE_TTL_SECONDS = 5 * 60; // 5 min — agrégat all-time
import {
  computeStreak,
  computeVisitXp,
  evaluateBadges,
  levelProgress,
  type XpBreakdown,
} from './gamification.logic';

const STREAK_MILESTONES = new Set([3, 7, 14, 30, 60, 100, 365]);

export interface VisitResult {
  visitId: string;
  xpAwarded: number;
  breakdown: XpBreakdown;
  totalXp: number;
  level: number;
  streak: { current: number; best: number };
  newBadges: Badge[];
}

/** Passeport & gamification : visites, XP, niveaux, streaks, badges, favoris. */
@Injectable()
export class PassportService {
  private readonly logger = new Logger(PassportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  /** Enregistre une visite et déclenche toute la cascade de gamification. */
  async recordVisit(
    userId: string,
    placeId: string,
    feedback?: VisitFeedback,
    notes?: string,
  ): Promise<VisitResult> {
    // Idempotence : si le mobile retenvoie la même requête dans la fenêtre de retry
    // (ex : réseau coupé entre envoi et réception de la réponse), on renvoie le résultat
    // mis en cache plutôt que d'enregistrer une seconde visite.
    const idemKey = `visit:idem:${userId}:${placeId}`;
    const cached = await this.redis.getJson<VisitResult>(idemKey).catch(() => null);
    if (cached) return cached;

    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const visitResult = await this.prisma.$transaction(async (tx) => {
      // Compteurs du jour (plafonds quotidiens) — avant insertion.
      const [visitPlaceCountToday, ratingCountToday, sameUniverse, sameCountry] = await Promise.all([
        tx.visit.count({ where: { userId, visitedAt: { gte: dayStart } } }),
        tx.visit.count({
          where: { userId, visitedAt: { gte: dayStart }, feedback: { not: null } },
        }),
        tx.visit.count({ where: { userId, place: { universe: place.universe } } }),
        tx.visit.count({ where: { userId, place: { countryCode: place.countryCode } } }),
      ]);

      // Streak.
      const existingStreak = await tx.streak.findUnique({ where: { userId } });
      const prevStreak = existingStreak
        ? { current: existingStreak.current, best: existingStreak.best }
        : { current: 0, best: 0 };
      const streak = computeStreak(prevStreak, existingStreak?.lastActivityDay ?? null, now);

      // XP.
      const { total: xpAwarded, breakdown } = computeVisitXp({
        hasFeedback: feedback != null,
        isNewUniverse: sameUniverse === 0,
        isNewCountry: sameCountry === 0,
        visitPlaceCountToday,
        ratingCountToday,
        newStreakCurrent: streak.current,
      });

      // Persistance : visite + user + streak.
      const visit = await tx.visit.create({
        data: {
          userId,
          placeId,
          xpAwarded,
          ...(feedback ? { feedback } : {}),
          ...(notes ? { notes: notes.trim() } : {}),
        },
      });

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const totalXp = user.totalXp + xpAwarded;
      const level = levelForXp(totalXp).level;
      await tx.user.update({ where: { id: userId }, data: { totalXp, level } });

      await tx.streak.upsert({
        where: { userId },
        create: {
          userId,
          current: streak.current,
          best: streak.best,
          lastActivityDay: dayStart,
        },
        update: { current: streak.current, best: streak.best, lastActivityDay: dayStart },
      });

      // Badges : on évalue puis on n'insère que les nouveaux.
      const distinctCountries = await this.countDistinctCountries(tx, userId);
      const candidates = evaluateBadges({
        streakCurrent: streak.current,
        distinctCountries,
        visitHourUtc: now.getUTCHours(),
        universe: place.universe,
      });
      const newBadges = await this.awardBadges(tx, userId, candidates);

      this.logger.debug(
        `Visite ${visit.id} : +${xpAwarded} XP, streak ${streak.current}, badges ${newBadges.join(',') || '∅'}`,
      );

      const result: VisitResult = {
        visitId: visit.id,
        xpAwarded,
        breakdown,
        totalXp,
        level,
        streak: { current: streak.current, best: streak.best },
        newBadges,
      };

      // Notifications push — fire-and-forget hors transaction
      setImmediate(() => this.sendVisitNotifications(userId, result, prevStreak.current));

      // Stocke le résultat 30 s pour absorber les retries mobile sans double-enregistrement.
      void this.redis.setJson(idemKey, result, VISIT_IDEM_TTL_SECONDS).catch(() => undefined);

      return result;
    });

    // Invalide le cache leaderboard dès qu'un XP est attribué
    const leaderKeys: string[] = ['leaderboard:global'];
    if (place.city) leaderKeys.push(`leaderboard:${place.city}`);
    void this.redis.del(...leaderKeys).catch(() => undefined);

    // Invalide les stats du lieu si un avis (feedback) a été donné
    if (feedback) {
      void this.redis.del(`place:stats:${placeId}`).catch(() => undefined);
    }

    // Invalide les caches utilisateur qui agrègent les visites
    void this.redis.del(
      `heatmap:${userId}:90`,
      `heatmap:${userId}:30`,
      `universe:breakdown:${userId}`,
    ).catch(() => undefined);

    return visitResult;
  }

  private async sendVisitNotifications(
    userId: string,
    result: VisitResult,
    prevStreakCurrent: number,
  ): Promise<void> {
    try {
      // 1. Nouveau badge
      for (const badge of result.newBadges) {
        await this.notifications.sendToUser(userId, '🏆 Nouveau badge !', `Tu as débloqué : ${badge}`);
      }

      // 2. Level up
      const prevLevel = levelForXp(result.totalXp - result.xpAwarded).level;
      if (result.level > prevLevel) {
        await this.notifications.sendToUser(
          userId,
          `🚀 Niveau ${result.level} atteint !`,
          `Tu as passé le cap — continue sur ta lancée.`,
        );
      }

      // 3. Streak milestone
      if (
        STREAK_MILESTONES.has(result.streak.current) &&
        result.streak.current > prevStreakCurrent
      ) {
        await this.notifications.sendToUser(
          userId,
          `🔥 ${result.streak.current} jours de suite !`,
          `Belle série — reviens demain pour la garder.`,
        );
      }
    } catch (err) {
      this.logger.warn('Erreur notification post-visite', err);
    }
  }

  /** Passeport : visites récentes (avec lieu) + agrégats. */
  async getPassport(userId: string, limit = 50) {
    const visits = await this.prisma.visit.findMany({
      where: { userId },
      include: { place: true },
      orderBy: { visitedAt: 'desc' },
      take: limit,
    });

    const countries = new Set(visits.map((v) => v.place.countryCode));
    const universes = new Set(visits.map((v) => v.place.universe));

    return {
      totalVisits: await this.prisma.visit.count({ where: { userId } }),
      distinctCountries: countries.size,
      distinctUniverses: universes.size,
      visits: visits.map((v) => ({
        id: v.id,
        visitedAt: v.visitedAt,
        feedback: v.feedback,
        xpAwarded: v.xpAwarded,
        place: {
          id: v.place.id,
          name: v.place.name,
          universe: v.place.universe,
          city: v.place.city,
          countryCode: v.place.countryCode,
          rating: v.place.rating,
        },
      })),
    };
  }

  /** Synthèse de gamification (niveau, progression, streak, badges). */
  async getStats(userId: string) {
    const [user, streak, earned] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.streak.findUnique({ where: { userId } }),
      this.prisma.earnedBadge.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' } }),
    ]);

    const progress = levelProgress(user.totalXp);
    return {
      totalXp: user.totalXp,
      level: {
        current: progress.current,
        next: progress.next,
        xpIntoLevel: progress.xpIntoLevel,
        xpForNext: progress.xpForNext,
        ratio: Math.round(progress.ratio * 100) / 100,
      },
      streak: {
        current: streak?.current ?? 0,
        best: streak?.best ?? 0,
        lastActivityDay: streak?.lastActivityDay ?? null,
        freezesLeft: streak?.freezesLeft ?? 0,
      },
      badges: {
        earned: earned.map((b) => b.badgeKey),
        total: BADGES.length,
      },
    };
  }

  /**
   * Utilise un freeze de streak (YUMIA Plus) pour prolonger le streak actuel
   * sans visite du jour. Ne peut être utilisé qu'une fois par jour.
   */
  async freezeStreak(userId: string): Promise<{ freezesLeft: number; streakCurrent: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.plan !== 'plus') {
      throw new ForbiddenException('Les freezes de streak sont réservés à YUMIA Plus.');
    }

    const streak = await this.prisma.streak.findUnique({ where: { userId } });
    if (!streak || streak.current === 0) {
      throw new BadRequestException('Aucun streak actif à protéger.');
    }
    if (streak.freezesLeft <= 0) {
      throw new BadRequestException('Tu n\'as plus de freezes disponibles.');
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Si le streak a déjà été maintenu aujourd'hui, pas besoin de freeze
    if (streak.lastActivityDay && streak.lastActivityDay >= todayStart) {
      throw new BadRequestException('Ton streak est déjà maintenu aujourd\'hui.');
    }

    const updated = await this.prisma.streak.update({
      where: { userId },
      data: {
        lastActivityDay: todayStart,
        freezesLeft: { decrement: 1 },
      },
    });

    this.logger.log(`Freeze utilisé par ${userId} — ${updated.freezesLeft} restants`);
    return { freezesLeft: updated.freezesLeft, streakCurrent: streak.current };
  }

  /** Sauvegarde un lieu (respecte le plafond Free). */
  async savePlace(userId: string, placeId: string, listName?: string) {
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const max = PLAN_LIMITS[user.plan].savedPlacesMax;
    if (Number.isFinite(max)) {
      const count = await this.prisma.savedPlace.count({ where: { userId } });
      if (count >= max) {
        throw new ForbiddenException(
          `Limite de ${max} lieux sauvegardés atteinte (passe à YUMIA Plus pour l'illimité).`,
        );
      }
    }

    return this.prisma.savedPlace.upsert({
      where: {
        userId_placeId_listName: { userId, placeId, listName: listName ?? 'a_essayer' },
      },
      create: { userId, placeId, ...(listName ? { listName } : {}) },
      update: {},
    });
  }

  /** Liste des lieux sauvegardés (avec lieu). */
  listSaved(userId: string) {
    return this.prisma.savedPlace.findMany({
      where: { userId },
      include: { place: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Heatmap d'activité : nombre de visites par jour pour les N derniers jours.
   * Renvoie un objet `{ "2026-06-21": 2, ... }` trié chronologiquement.
   */
  async getHeatmap(userId: string, days = 90): Promise<Record<string, number>> {
    const heatmapKey = `heatmap:${userId}:${days}`;
    const cached = await this.redis.getJson<Record<string, number>>(heatmapKey).catch(() => null);
    if (cached) return cached;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const visits = await this.prisma.visit.findMany({
      where: { userId, visitedAt: { gte: since } },
      select: { visitedAt: true },
    });
    const map: Record<string, number> = {};
    for (const v of visits) {
      const key = v.visitedAt.toISOString().slice(0, 10);
      map[key] = (map[key] ?? 0) + 1;
    }

    void this.redis.setJson(heatmapKey, map, HEATMAP_CACHE_TTL_SECONDS).catch(() => undefined);
    return map;
  }

  /** Breakdown des visites par univers (top univers de l'utilisateur). */
  async getUniverseBreakdown(userId: string): Promise<{ universe: string; count: number }[]> {
    const universeKey = `universe:breakdown:${userId}`;
    const cached = await this.redis.getJson<{ universe: string; count: number }[]>(universeKey).catch(() => null);
    if (cached) return cached;

    const rows = await this.prisma.visit.findMany({
      where: { userId },
      select: { place: { select: { universe: true } } },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const u = r.place.universe;
      counts[u] = (counts[u] ?? 0) + 1;
    }
    const breakdown = Object.entries(counts)
      .map(([universe, count]) => ({ universe, count }))
      .sort((a, b) => b.count - a.count);

    void this.redis.setJson(universeKey, breakdown, UNIVERSE_CACHE_TTL_SECONDS).catch(() => undefined);
    return breakdown;
  }

  /** Retire un lieu de toutes les listes sauvegardées de l'utilisateur. */
  async unsavePlace(userId: string, placeId: string): Promise<void> {
    await this.prisma.savedPlace.deleteMany({ where: { userId, placeId } });
  }

  /**
   * Enregistre une préférence swipe (like/dislike) dans les préférences user.
   * Stocké sous preferences.swipeLikes[] et preferences.swipeDislikes[].
   * Utilisé par le moteur IA pour affiner les recommendations.
   */
  async recordSwipe(userId: string, placeId: string, liked: boolean): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = (user?.preferences ?? {}) as Record<string, unknown>;
    const key = liked ? 'swipeLikes' : 'swipeDislikes';
    const existing = (prefs[key] as string[] | undefined) ?? [];
    if (!existing.includes(placeId)) {
      // Garde les 200 derniers swipes max pour éviter la croissance infinie
      const updated = [placeId, ...existing].slice(0, 200);
      await this.prisma.user.update({
        where: { id: userId },
        data: { preferences: { ...prefs, [key]: updated } },
      });
    }
  }

  /**
   * Classement hebdomadaire des utilisateurs les plus actifs.
   * Scope optionnel : filtre par ville via les lieux visités cette semaine.
   * Renvoie les 50 premiers utilisateurs avec leur XP de la semaine et leur rang.
   */
  async getLeaderboard(city?: string): Promise<{
    rank: number;
    userId: string;
    displayName: string | null;
    weeklyXp: number;
    totalXp: number;
    level: number;
    streak: number;
  }[]> {
    const cacheKey = `leaderboard:${city ?? 'global'}`;
    const cached = await this.redis.getJson<ReturnType<typeof this.getLeaderboard>>(cacheKey).catch(() => null);
    if (cached) return cached as Awaited<ReturnType<typeof this.getLeaderboard>>;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // Visites de la semaine, filtrées par ville si demandé
    const visits = await this.prisma.visit.findMany({
      where: {
        visitedAt: { gte: weekStart },
        ...(city ? { place: { city: { equals: city, mode: 'insensitive' } } } : {}),
      },
      select: { userId: true, xpAwarded: true },
    });

    // Agréger le XP hebdomadaire par utilisateur
    const xpByUser = new Map<string, number>();
    for (const v of visits) {
      xpByUser.set(v.userId, (xpByUser.get(v.userId) ?? 0) + v.xpAwarded);
    }

    if (xpByUser.size === 0) return [];

    const userIds = Array.from(xpByUser.keys());
    const [users, streaks] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, totalXp: true, level: true },
      }),
      this.prisma.streak.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, current: true },
      }),
    ]);

    const streakMap = new Map(streaks.map((s) => [s.userId, s.current]));

    const ranked = users
      .map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        weeklyXp: xpByUser.get(u.id) ?? 0,
        totalXp: u.totalXp,
        level: u.level,
        streak: streakMap.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.weeklyXp - a.weeklyXp)
      .slice(0, 50)
      .map((u, idx) => ({ rank: idx + 1, ...u }));

    void this.redis.setJson(cacheKey, ranked, 5 * 60).catch(() => undefined);
    return ranked;
  }

  /**
   * Historique paginé des visites (cursor-based pagination).
   * Renvoie jusqu'à `limit` visites avant le curseur fourni.
   */
  async getVisitHistory(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{
    items: {
      id: string;
      visitedAt: Date;
      feedback: VisitFeedback | null;
      xpAwarded: number;
      notes: string | null;
      place: { id: string; name: string; universe: string; city: string | null; countryCode: string; rating: number };
    }[];
    nextCursor: string | null;
    total: number;
  }> {
    const [items, total] = await Promise.all([
      this.prisma.visit.findMany({
        where: { userId },
        include: { place: { select: { id: true, name: true, universe: true, city: true, countryCode: true, rating: true } } },
        orderBy: { visitedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      this.prisma.visit.count({ where: { userId } }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page.map((v) => ({
        id: v.id,
        visitedAt: v.visitedAt,
        feedback: v.feedback,
        xpAwarded: v.xpAwarded,
        notes: v.notes,
        place: v.place,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      total,
    };
  }

  // ---- privés ----------------------------------------------------------

  private async countDistinctCountries(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const rows = await tx.visit.findMany({
      where: { userId },
      select: { place: { select: { countryCode: true } } },
    });
    return new Set(rows.map((r) => r.place.countryCode)).size;
  }

  private async awardBadges(
    tx: Prisma.TransactionClient,
    userId: string,
    candidates: Badge[],
  ): Promise<Badge[]> {
    if (candidates.length === 0) return [];
    const existing = await tx.earnedBadge.findMany({
      where: { userId, badgeKey: { in: candidates } },
      select: { badgeKey: true },
    });
    const have = new Set(existing.map((e) => e.badgeKey));
    const fresh = candidates.filter((b) => !have.has(b));
    if (fresh.length > 0) {
      await tx.earnedBadge.createMany({
        data: fresh.map((badgeKey) => ({ userId, badgeKey })),
        skipDuplicates: true,
      });
    }
    return fresh;
  }
}
