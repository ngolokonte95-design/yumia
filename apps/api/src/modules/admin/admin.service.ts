import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PLANS, type Plan } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { isAdminEmail } from '../auth/is-admin-email';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(email: string): boolean {
    return isAdminEmail(email);
  }

  /**
   * Change le forfait de l'admin lui-même, pour voir l'app comme la voit
   * chaque palier.
   *
   * Ne touche QUE le compte appelant : un endpoint capable de changer le
   * forfait de n'importe qui deviendrait, le jour d'une fuite de jeton admin,
   * un distributeur d'abonnements gratuits.
   *
   * `isPremium` suit `plan` — les deux champs coexistent depuis les paliers,
   * et les laisser diverger enverrait l'app vers deux comportements
   * contradictoires selon le champ qu'elle lit.
   */
  async setOwnPlan(userId: string, plan: string): Promise<{ plan: Plan; isPremium: boolean }> {
    if (!PLANS.includes(plan as Plan)) {
      throw new Error(`Forfait inconnu : ${plan}`);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { plan: plan as Plan, isPremium: plan !== 'free' },
      select: { plan: true, isPremium: true },
    });
    return { plan: updated.plan as Plan, isPremium: updated.isPremium };
  }

  /**
   * Liste des comptes du centre de contrôle.
   *
   * `segment` reprend exactement les cartes de la vue d'ensemble (mêmes
   * bornes de date que getOverview) : toucher « Nouveaux (7 j) » doit lister
   * les comptes que la carte a comptés, pas une approximation.
   */
  async listUsers(params: {
    segment?: string;
    q?: string;
    country?: string;
    offset?: number;
    limit?: number;
  }) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);
    // Au-delà, une suspension est un bannissement (cf. PERMANENT_YEARS).
    const banThreshold = new Date(now.getTime() + 50 * 365 * 86400000);

    const and: Prisma.UserWhereInput[] = [];
    switch (params.segment) {
      case 'premium': and.push({ isPremium: true }); break;
      case 'active7d': and.push({ visits: { some: { visitedAt: { gte: weekAgo } } } }); break;
      case 'newToday': and.push({ createdAt: { gte: today } }); break;
      case 'new7d': and.push({ createdAt: { gte: weekAgo } }); break;
      case 'new30d': and.push({ createdAt: { gte: monthAgo } }); break;
      case 'suspended': and.push({ suspendedUntil: { gt: now, lte: banThreshold } }); break;
      case 'banned': and.push({ suspendedUntil: { gt: banThreshold } }); break;
      default: break;
    }
    if (params.country) {
      and.push(params.country === 'XX' ? { countryCode: null } : { countryCode: params.country });
    }
    const q = params.q?.trim();
    if (q) {
      and.push({
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const take = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const skip = Math.max(params.offset ?? 0, 0);

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true, email: true, displayName: true, photoUrl: true, countryCode: true,
          plan: true, isPremium: true, createdAt: true, suspendedUntil: true, suspendedReason: true,
        },
      }),
    ]);
    return {
      total,
      items: items.map((u) => ({ ...u, isAdmin: isAdminEmail(u.email) })),
    };
  }

  /** Fiche d'un compte : identité, forfait, activité, signalements. */
  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, displayName: true, photoUrl: true, bio: true, countryCode: true,
        locale: true, authProvider: true, plan: true, isPremium: true, premiumSince: true,
        createdAt: true, updatedAt: true, suspendedUntil: true, suspendedReason: true,
        _count: { select: { visits: true, savedPlaces: true, orders: true, savedItineraries: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const safe = (p: Promise<number>) => p.catch(() => 0);
    const [posts, reportsAgainst, reportsMade, lastVisit, activeSessions] = await Promise.all([
      safe(this.prisma.post.count({ where: { userId: id } })),
      safe(this.prisma.report.count({ where: { targetType: 'user', targetId: id } })),
      safe(this.prisma.report.count({ where: { reporterId: id } })),
      this.prisma.visit
        .findFirst({ where: { userId: id }, orderBy: { visitedAt: 'desc' }, select: { visitedAt: true } })
        .catch(() => null),
      safe(this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } })),
    ]);

    const { _count, ...rest } = user;
    return {
      ...rest,
      isAdmin: isAdminEmail(user.email),
      stats: {
        visits: _count.visits,
        savedPlaces: _count.savedPlaces,
        orders: _count.orders,
        savedItineraries: _count.savedItineraries,
        posts,
        reportsAgainst,
        reportsMade,
        activeSessions,
      },
      lastVisitAt: lastVisit?.visitedAt ?? null,
    };
  }

  async getOverview() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);

    const safe = (p: Promise<number>) => p.catch(() => 0);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      totalPlaces,
      totalVisits,
      premiumUsers,
      activeUsers7d,
    ] = await Promise.all([
      safe(this.prisma.user.count()),
      safe(this.prisma.user.count({ where: { createdAt: { gte: today } } })),
      safe(this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } })),
      safe(this.prisma.user.count({ where: { createdAt: { gte: monthAgo } } })),
      safe(this.prisma.place.count()),
      safe(this.prisma.visit.count()),
      safe(this.prisma.user.count({ where: { isPremium: true } })),
      safe(this.prisma.user.count({ where: { visits: { some: { visitedAt: { gte: weekAgo } } } } })),
    ]);

    return {
      users: { total: totalUsers, newToday, newThisWeek, newThisMonth, premium: premiumUsers, active7d: activeUsers7d },
      content: { places: totalPlaces, visits: totalVisits },
    };
  }

  async getUsersByCountry(): Promise<Array<{ countryCode: string; count: number; pct: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ countryCode: string | null; count: bigint }>>`
      SELECT "countryCode", COUNT(*)::bigint as count
      FROM "User"
      GROUP BY "countryCode"
      ORDER BY count DESC
      LIMIT 50
    `;

    const total = rows.reduce((acc, r) => acc + Number(r.count), 0);
    return rows.map((r) => ({
      countryCode: r.countryCode ?? 'XX',
      count: Number(r.count),
      pct: total > 0 ? Math.round((Number(r.count) / total) * 100 * 10) / 10 : 0,
    }));
  }

  async getUserGrowth(days = 30): Promise<Array<{ date: string; count: number }>> {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
      FROM "User"
      WHERE "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  async getPlacesByUniverse(): Promise<Array<{ universe: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ universe: string; count: bigint }>>`
      SELECT "universe", COUNT(*)::bigint as count
      FROM "Place"
      GROUP BY "universe"
      ORDER BY count DESC
    `;
    return rows.map((r) => ({ universe: r.universe, count: Number(r.count) }));
  }

  async getRecentUsers(limit = 20) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, email: true, displayName: true, countryCode: true, plan: true, isPremium: true, createdAt: true },
    });
  }

  async backfillCountriesFromLocale(): Promise<{ updated: number }> {
    const result = await this.prisma.$executeRaw`
      UPDATE "User"
      SET "countryCode" = UPPER(SPLIT_PART(locale, '-', 2))
      WHERE "countryCode" IS NULL
        AND locale LIKE '%-%'
        AND LENGTH(SPLIT_PART(locale, '-', 2)) = 2
    `;
    return { updated: Number(result) };
  }
}
