import { Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
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
  plan?: Plan | null;
};

const USER_SOCIAL_SELECT = {
  id: true, displayName: true, photoUrl: true, plan: true, bio: true,
  gender: true, level: true, totalXp: true,
};

/** Recul minimal entre un croisement et son affichage. */
const ENCOUNTER_DELAY_MS = 60 * 60 * 1000;

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
      select: { id: true, displayName: true, photoUrl: true, plan: true, bio: true, gender: true },
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

    const nearby = candidates
      .filter((c) => userMap[c.userId])
      .slice(0, limit)
      .map((c) => ({ ...userMap[c.userId], distanceKm: Math.round(c.dist * 10) / 10 }));

    // Des profils étaient proches, mais aucun ne correspond au genre demandé :
    // on élargit à toute la base plutôt que de renvoyer une liste vide. Sans
    // ce repli, filtrer sur « Homme » ou « Femme » ne donnait aucun résultat
    // dès qu'un profil correspondant n'avait pas partagé sa position.
    if (!nearby.length) {
      return this.getRandomProfiles(viewerId, seenSet, limit, interestedIn);
    }

    return nearby;
  }

  async markSeen(viewerId: string, targetId: string) {
    const seenKey = `swipe:seen:${viewerId}`;
    await this.redis.raw.sadd(seenKey, targetId);
    await this.redis.raw.expire(seenKey, 86400);
  }

  /**
   * Onglet Rencontres. Seulement si j'ai activé les Rencontres, seulement avec
   * des membres qui les ont encore activées, jamais un blocage ; et avec au
   * moins une heure de recul sur le dernier croisement : on voit qui on a
   * croisé, pas qui est à côté maintenant. Ni lieu ni heure dans la réponse.
   */
  async getMyEncounters(userId: string, limit = 20) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { shareEncounters: true } });
    if (!me?.shareEncounters) return [];

    const records = await this.prisma.encounter.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        seenAt: { lt: new Date(Date.now() - ENCOUNTER_DELAY_MS) },
      },
      orderBy: { day: 'desc' },
      take: limit * 2,
    });
    const otherIds = records.map((e) => (e.userAId === userId ? e.userBId : e.userAId));
    const [users, blocks] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: otherIds }, shareEncounters: true },
        select: { id: true, displayName: true, photoUrl: true, plan: true, bio: true, level: true },
      }),
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId, blockedId: { in: otherIds } }, { blockedId: userId, blockerId: { in: otherIds } }] },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const blocked = new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));

    return records
      .flatMap((e) => {
        const otherId = e.userAId === userId ? e.userBId : e.userAId;
        const otherUser = userMap.get(otherId);
        if (!otherUser || blocked.has(otherId)) return [];
        return [{ id: e.id, day: e.day.toISOString().slice(0, 10), otherUser }];
      })
      .slice(0, limit);
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
