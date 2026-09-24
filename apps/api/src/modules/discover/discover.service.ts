import { Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrivacyService, adultBirthYearFilter } from '../../infra/privacy/privacy.service';

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

/** Profils Tind par requête — `limit` vient du client. */
const MAX_SWIPE_LIMIT = 30;
/** Marqueurs sur la carte des membres (au-delà, react-native-maps sature iOS). */
const MAX_WORLD_MAP_USERS = 60;

/**
 * Position publiée sur la carte : arrondie à ~1 km. La carte montre où sont
 * les membres, pas leur porte d'entrée.
 */
export function blurCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Candidats Tind : majeurs de façon certaine, ni suspendus, ni privés, ni
 * bloqués dans un sens ou dans l'autre.
 */
function swipeCandidateWhere(excludeIds: string[], interestedIn?: string) {
  const where: Record<string, unknown> = {
    id: { notIn: excludeIds },
    isPrivate: false,
    OR: [{ suspendedUntil: null }, { suspendedUntil: { lt: new Date() } }],
    ...adultBirthYearFilter(),
  };
  if (interestedIn && interestedIn !== 'everyone') where['gender'] = interestedIn;
  return where;
}

@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly privacy: PrivacyService,
  ) {}

  // ── World Map ── positions « tout le monde », plus celles « amis » des
  //    abonnements mutuels ; jamais un blocage, dans un sens ou dans l'autre.
  //    L'audience a été fixée par le réglage `mapAudience` du propriétaire.

  async getWorldMapUsers(viewerId: string, interestedIn?: string): Promise<Array<{
    userId: string; lat: number; lng: number;
    displayName: string; photoUrl?: string | null; bio?: string | null; gender?: string | null;
  }>> {
    const [follows, blocks] = await Promise.all([
      this.prisma.follow.findMany({
        where: { OR: [{ followerId: viewerId }, { followingId: viewerId }] },
        select: { followerId: true, followingId: true },
      }),
      this.prisma.block.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] } }),
    ]);
    const iFollow = new Set(follows.filter((f) => f.followerId === viewerId).map((f) => f.followingId));
    const friends = new Set(
      follows.filter((f) => f.followingId === viewerId && iFollow.has(f.followerId)).map((f) => f.followerId),
    );
    const blocked = new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)));

    const keys = await this.redis.raw.keys('user:loc:*');
    const visibleIds: Array<{ userId: string; lat: number; lng: number }> = [];

    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as StoredLocation;
        const uid = key.replace('user:loc:', '');
        if (uid === viewerId || blocked.has(uid)) continue;
        const visible =
          loc.visibility === 'map' || loc.visibility === 'everyone' ||
          (loc.visibility === 'friends' && friends.has(uid));
        if (visible) visibleIds.push({ userId: uid, lat: loc.lat, lng: loc.lng });
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
      .slice(0, MAX_WORLD_MAP_USERS)
      .map((v) => ({ ...v, lat: blurCoord(v.lat), lng: blurCoord(v.lng), ...userMap[v.userId] }));
  }

  // ── Swipe Discovery ── filtered by gender preference ─────────────────────

  async getSwipeProfiles(
    viewerId: string, lat: number, lng: number,
    limit = 10, interestedIn?: string,
  ): Promise<Array<UserSelect & { distanceKm?: number }>> {
    // Tind est réservé aux majeurs, des deux côtés : on ne montre aucun
    // profil à un mineur, et aucun mineur à personne (swipeCandidateWhere).
    await this.privacy.assertAdult(viewerId);
    limit = Math.min(Math.max(1, Math.floor(limit) || 10), MAX_SWIPE_LIMIT);
    const blocked = await this.privacy.blockedIds(viewerId);
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

    const blockedSet = new Set(blocked);
    const candidates = nearbyIds
      .filter((u) => !seenSet.has(u.userId) && !blockedSet.has(u.userId))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit * 3); // over-fetch to allow gender filtering

    if (!candidates.length) {
      return this.getRandomProfiles(viewerId, seenSet, blocked, limit, interestedIn);
    }

    const userIds = candidates.map((c) => c.userId);
    const where = { ...swipeCandidateWhere([viewerId, ...blocked], interestedIn), id: { in: userIds, notIn: [viewerId, ...blocked] } };

    const users = await this.prisma.user.findMany({ where, select: USER_SOCIAL_SELECT });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const nearby = candidates
      .filter((c) => userMap[c.userId])
      .slice(0, limit)
      // Distance au kilomètre, jamais en dessous de 1 : au dixième, trois
      // mesures depuis trois endroits suffisaient à situer quelqu'un.
      .map((c) => ({ ...userMap[c.userId], distanceKm: Math.max(1, Math.round(c.dist)) }));

    // Des profils étaient proches, mais aucun ne correspond au genre demandé :
    // on élargit à toute la base plutôt que de renvoyer une liste vide. Sans
    // ce repli, filtrer sur « Homme » ou « Femme » ne donnait aucun résultat
    // dès qu'un profil correspondant n'avait pas partagé sa position.
    if (!nearby.length) {
      return this.getRandomProfiles(viewerId, seenSet, blocked, limit, interestedIn);
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
    limit = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { shareEncounters: true, gender: true } });
    if (!me?.shareEncounters) return [];
    // Rencontres réservées aux majeurs (des deux côtés, cf. filtre plus bas).
    await this.privacy.assertAdult(userId);

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
        where: { id: { in: otherIds }, shareEncounters: true, ...adultBirthYearFilter() },
        select: { id: true, displayName: true, photoUrl: true, plan: true, bio: true, level: true, encounterAudience: true },
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
        const other = userMap.get(otherId);
        if (!other || blocked.has(otherId)) return [];
        // L'autre a choisi qui peut le voir : « femmes » ou « hommes »
        // uniquement, d'après le genre déclaré de celui qui regarde.
        if (other.encounterAudience !== 'everyone' && other.encounterAudience !== me.gender) return [];
        const { encounterAudience: _audience, ...otherUser } = other;
        return [{ id: e.id, day: e.day.toISOString().slice(0, 10), otherUser }];
      })
      .slice(0, limit);
  }

  private async getRandomProfiles(
    viewerId: string, seenSet: Set<string>, blocked: string[], limit: number, interestedIn?: string,
  ) {
    return this.prisma.user.findMany({
      where: swipeCandidateWhere([viewerId, ...Array.from(seenSet), ...blocked], interestedIn),
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
