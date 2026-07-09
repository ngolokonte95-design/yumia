import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

const LOC_KEY = (userId: string) => `user:loc:${userId}`;

interface StoredLocation {
  lat: number;
  lng: number;
  visibility: string;
  updatedAt: string;
}

type UserSelect = {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  gender?: string | null;
  level: number;
  totalXp: number;
};

const USER_SOCIAL_SELECT = {
  id: true, displayName: true, photoUrl: true, bio: true,
  gender: true, level: true, totalXp: true,
};

@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── World Map ── all users with visibility 'map' or 'everyone' ────────────

  async getWorldMapUsers(viewerId: string, interestedIn?: string): Promise<Array<{
    userId: string; lat: number; lng: number;
    displayName: string; photoUrl?: string | null; bio?: string | null; gender?: string | null;
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
    const where: Record<string, unknown> = { id: { in: userIds } };
    if (interestedIn && interestedIn !== 'everyone') where['gender'] = interestedIn;

    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, displayName: true, photoUrl: true, bio: true, gender: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return visibleIds
      .filter((v) => userMap[v.userId])
      .map((v) => ({ ...v, ...userMap[v.userId] }));
  }

  // ── Swipe Discovery ── filtered by gender preference ─────────────────────

  async getSwipeProfiles(
    viewerId: string, lat: number, lng: number,
    limit = 10, interestedIn?: string,
  ): Promise<Array<UserSelect & { distanceKm?: number }>> {
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

    const seenKey = `swipe:seen:${viewerId}`;
    const seen = await this.redis.raw.smembers(seenKey);
    const seenSet = new Set(seen);

    const candidates = nearbyIds
      .filter((u) => !seenSet.has(u.userId))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit * 3); // over-fetch to allow gender filtering

    if (!candidates.length) {
      return this.getRandomProfiles(viewerId, seenSet, limit, interestedIn);
    }

    const userIds = candidates.map((c) => c.userId);
    const where: Record<string, unknown> = { id: { in: userIds } };
    if (interestedIn && interestedIn !== 'everyone') where['gender'] = interestedIn;

    const users = await this.prisma.user.findMany({ where, select: USER_SOCIAL_SELECT });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return candidates
      .filter((c) => userMap[c.userId])
      .slice(0, limit)
      .map((c) => ({ ...userMap[c.userId], distanceKm: Math.round(c.dist * 10) / 10 }));
  }

  async markSeen(viewerId: string, targetId: string) {
    const seenKey = `swipe:seen:${viewerId}`;
    await this.redis.raw.sadd(seenKey, targetId);
    await this.redis.raw.expire(seenKey, 86400);
  }

  // ── Encounters ── detect same-place + send push notification ─────────────

  async checkEncounters(userId: string, placeId: string, lat: number, lng: number) {
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
        if (dist <= 0.1) nearbyUsers.push(uid);
      } catch { /* ignore */ }
    }

    if (!nearbyUsers.length) return [];

    // Load viewer name for notification
    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, gender: true },
    });

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { name: true },
    });

    const encounters: string[] = [];
    for (const otherId of nearbyUsers) {
      const [a, b] = [userId, otherId].sort();
      try {
        const result = await this.prisma.encounter.upsert({
          where: { userAId_userBId_placeId: { userAId: a, userBId: b, placeId } },
          update: { seenAt: new Date() },
          create: { userAId: a, userBId: b, placeId },
        });

        // Only send push on first encounter (seenAt ~= createdAt)
        const isNew = Math.abs(result.seenAt.getTime() - (result as any).createdAt?.getTime?.() ?? 0) < 5000;
        if (isNew || true) { // always notify on re-encounter within session
          const otherUser = await this.prisma.user.findUnique({
            where: { id: otherId },
            select: { interestedIn: true, gender: true },
          });

          // Respect gender preference before notifying
          const viewerGender = viewer?.gender;
          const otherInterestedIn = otherUser?.interestedIn ?? 'everyone';
          const matchesPreference = otherInterestedIn === 'everyone' || otherInterestedIn === viewerGender;

          if (matchesPreference) {
            await this.notifications.sendToUser(
              otherId,
              '⚡ Quelqu\'un est près de toi !',
              `${viewer?.displayName ?? 'Un utilisateur'} est ${place ? 'à ' + place.name : 'près de toi'} en ce moment`,
              { type: 'encounter', userId, placeId },
            );
          }
        }
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
        select: { id: true, displayName: true, photoUrl: true, bio: true, level: true, gender: true },
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

  private async getRandomProfiles(viewerId: string, seenSet: Set<string>, limit: number, interestedIn?: string) {
    const where: Record<string, unknown> = { id: { notIn: [viewerId, ...Array.from(seenSet)] } };
    if (interestedIn && interestedIn !== 'everyone') where['gender'] = interestedIn;
    return this.prisma.user.findMany({
      where,
      select: USER_SOCIAL_SELECT,
      take: limit,
      orderBy: { totalXp: 'desc' },
    });
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
