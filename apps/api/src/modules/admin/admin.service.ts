import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(email: string): boolean {
    const raw = process.env.ADMIN_EMAILS ?? '';
    const set = new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
    return set.has(email.toLowerCase());
  }

  async getOverview() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      totalPlaces,
      totalVisits,
      totalPosts,
      totalMeetups,
      premiumUsers,
      activeUsers7d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthAgo } } }),
      this.prisma.place.count(),
      this.prisma.visit.count(),
      this.prisma.post.count(),
      this.prisma.meetupEvent.count(),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.user.count({ where: { visits: { some: { visitedAt: { gte: weekAgo } } } } }),
    ]);

    return {
      users: { total: totalUsers, newToday, newThisWeek, newThisMonth, premium: premiumUsers, active7d: activeUsers7d },
      content: { places: totalPlaces, visits: totalVisits, posts: totalPosts, meetups: totalMeetups },
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
}
