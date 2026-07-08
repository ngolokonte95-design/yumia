import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

const LOC_KEY = (userId: string) => `user:loc:${userId}`;

interface StoredLocation {
  lat: number;
  lng: number;
  visibility: string;
  updatedAt: string;
}

@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── World Map ── all users with visibility 'map' or 'everyone' ────────────

  async getWorldMapUsers(viewerId: string): Promise<Array<{
    userId: string; lat: number; lng: number;
    displayName: string; photoUrl?: string | null; bio?: string | null;
  }>> {
    const keys = await this.redis.raw.keys('user:loc:*');
    const visibleIds: Array<{ userId: string; lat: number; lng: number }> = [];

    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as StoredLocation;
        const uid = key.replace('user:loc:', '');
        if (uid === viewerId) continue;
        if (loc.visibility === 'map' || loc.visibility === 'everyone') {
          visibleIds.push({ userId: uid, lat: loc.lat, lng: loc.lng });
        }
      } catch { /* ignore */ }
    }

    if (!visibleIds.length) return [];

    const userIds = visibleIds.map((v) => v.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true, bio: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return visibleIds
      .filter((v) => userMap[v.userId])
      .map((v) => ({ ...v, ...userMap[v.userId] }));
  }

  // ── Swipe Discovery ── profiles to swipe through near viewer ─────────────

  async getSwipeProfiles(viewerId: string, lat: number, lng: number, limit = 10): Promise<Array<{
    id: string; displayName: string; photoUrl?: string | null; bio?: string | null;
    level: number; totalXp: number; distanceKm?: number;
  }>> {
    // Get all nearby visible users
    const keys = await this.redis.raw.keys('user:loc:*');
    const nearbyIds: Array<{ userId: string; lat: number; lng: number; dist: number }> = [];

    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as StoredLocation;
        const uid = key.replace('user:loc:', '');
        if (uid === viewerId || loc.visibility === 'off' || loc.visibility === 'friends') continue;
        const dist = this.haversineKm(lat, lng, loc.lat, loc.lng);
        if (dist <= 50) nearbyIds.push({ userId: uid, lat: loc.lat, lng: loc.lng, dist });
      } catch { /* ignore */ }
    }

    // Already seen/swiped in last 24h — exclude them
    const seenKey = `swipe:seen:${viewerId}`;
    const seen = await this.redis.raw.smembers(seenKey);
    const seenSet = new Set(seen);

    const candidates = nearbyIds
      .filter((u) => !seenSet.has(u.userId))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);

    if (!candidates.length) {
      // Fallback: return random global users if no one nearby
      return this.getRandomProfiles(viewerId, seenSet, limit);
    }

    const userIds = candidates.map((c) => c.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true, bio: true, level: true, totalXp: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return candidates
      .filter((c) => userMap[c.userId])
      .map((c) => ({ ...userMap[c.userId], distanceKm: Math.round(c.dist * 10) / 10 }));
  }

  async markSeen(viewerId: string, targetId: string) {
    const seenKey = `swipe:seen:${viewerId}`;
    await this.redis.raw.sadd(seenKey, targetId);
    await this.redis.raw.expire(seenKey, 86400); // reset after 24h
  }

  // ── Encounters ── detect same-place visits ────────────────────────────────

  async checkEncounters(userId: string, placeId: string, lat: number, lng: number) {
    // Get all users at this place (within 100m) in the last 2h
    const keys = await this.redis.raw.keys('user:loc:*');
    const nearbyUsers: string[] = [];

    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as StoredLocation;
        const uid = key.replace('user:loc:', '');
        if (uid === userId || loc.visibility === 'off') continue;
        const dist = this.haversineKm(lat, lng, loc.lat, loc.lng);
        if (dist <= 0.1) nearbyUsers.push(uid); // 100m radius
      } catch { /* ignore */ }
    }

    if (!nearbyUsers.length) return [];

    // Create encounter records (idempotent due to unique constraint)
    const encounters: string[] = [];
    for (const otherId of nearbyUsers) {
      const [a, b] = [userId, otherId].sort();
      try {
        await this.prisma.encounter.upsert({
          where: { userAId_userBId_placeId: { userAId: a, userBId: b, placeId } },
          update: { seenAt: new Date() },
          create: { userAId: a, userBId: b, placeId },
        });
        encounters.push(otherId);
      } catch { /* ignore dup */ }
    }
    return encounters;
  }

  async getMyEncounters(userId: string, limit = 20) {
    const records = await this.prisma.encounter.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { seenAt: 'desc' },
      take: limit,
    });

    const otherIds = records.map((e) => (e.userAId === userId ? e.userBId : e.userAId));
    const placeIds = [...new Set(records.map((e) => e.placeId))];

    const [users, places] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, displayName: true, photoUrl: true, bio: true, level: true },
      }),
      this.prisma.place.findMany({
        where: { id: { in: placeIds } },
        select: { id: true, name: true, universe: true, city: true },
      }),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));

    return records.map((e) => {
      const otherId = e.userAId === userId ? e.userBId : e.userAId;
      return { ...e, otherUser: userMap[otherId] ?? null, place: placeMap[e.placeId] ?? null };
    });
  }

  private async getRandomProfiles(viewerId: string, seenSet: Set<string>, limit: number) {
    const users = await this.prisma.user.findMany({
      where: { id: { notIn: [viewerId, ...Array.from(seenSet)] } },
      select: { id: true, displayName: true, photoUrl: true, bio: true, level: true, totalXp: true },
      take: limit,
      orderBy: { totalXp: 'desc' },
    });
    return users;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
