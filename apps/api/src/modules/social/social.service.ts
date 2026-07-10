import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

const INTENT_KEY = (uid: string) => `social:intent:${uid}`;
const EVENT_KEY  = (id: string)  => `social:event:${id}`;
const EVENT_IDX  = 'social:events:index';
const LOC_PREFIX = 'user:loc:';

export type IntentType = 'dispo' | 'explore' | 'event';

export interface SocialIntent {
  userId:      string;
  displayName: string;
  photoUrl?:   string;
  level:       number;
  lat:         number;
  lng:         number;
  intent:      IntentType;
  universe?:   string;
  note?:       string;
  expiresAt:   string;
  createdAt:   string;
}

export interface SocialEvent {
  id:               string;
  creatorId:        string;
  creatorName:      string;
  creatorPhotoUrl?: string;
  lat:              number;
  lng:              number;
  universe?:        string;
  title:            string;
  note?:            string;
  scheduledAt:      string;
  maxPeople:        number;
  participants:     string[];
  createdAt:        string;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Follow / Unfollow ────────────────────────────────────────────────────

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new ConflictException('Impossible de se suivre soi-même');
    const target = await this.prisma.user.findUnique({ where: { id: followingId }, select: { id: true } });
    if (!target) throw new NotFoundException('Utilisateur introuvable');
    return this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId },
    });
  }

  async unfollow(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const f = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return !!f;
  }

  // ── User discovery ───────────────────────────────────────────────────────

  async searchUsers(query: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true, photoUrl: true, bio: true, totalXp: true, level: true },
      take: limit,
    });
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, photoUrl: true, bio: true, totalXp: true, level: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const [followersCount, followingCount, visitCount, isFollowed] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.prisma.visit.count({ where: { userId } }),
      viewerId ? this.isFollowing(viewerId, userId) : false,
    ]);
    return { ...user, followersCount, followingCount, visitCount, isFollowedByMe: isFollowed };
  }

  async getFollowers(userId: string, limit = 50) {
    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = follows.map((f) => f.followerId);
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, photoUrl: true, bio: true, level: true },
    });
  }

  async getFollowing(userId: string, limit = 50) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = follows.map((f) => f.followingId);
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, photoUrl: true, bio: true, level: true },
    });
  }

  async getSocialFeed(userId: string, limit = 30) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: userId } });
    const followingIds = follows.map((f) => f.followingId);
    const visits = await this.prisma.visit.findMany({
      where: { userId: { in: followingIds } },
      orderBy: { visitedAt: 'desc' },
      take: limit,
      include: { place: { select: { id: true, name: true, universe: true, city: true, photoUrls: true } } },
    });
    const userIds = [...new Set(visits.map((v) => v.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return visits.map((v) => ({ ...v, user: userMap[v.userId] ?? null }));
  }

  // ── Intent signals (Redis-only, éphémères) ───────────────────────────────

  async setIntent(
    userId: string,
    dto: {
      displayName: string;
      photoUrl?:   string;
      level:       number;
      lat:         number;
      lng:         number;
      intent:      IntentType;
      universe?:   string;
      note?:       string;
      durationHours: number;
    },
  ): Promise<SocialIntent> {
    const ttlSecs = Math.min(dto.durationHours, 24) * 3600;
    const payload: SocialIntent = {
      userId,
      displayName: dto.displayName,
      photoUrl:    dto.photoUrl,
      level:       dto.level,
      lat:         dto.lat,
      lng:         dto.lng,
      intent:      dto.intent,
      universe:    dto.universe,
      note:        dto.note?.slice(0, 100),
      expiresAt:   new Date(Date.now() + ttlSecs * 1000).toISOString(),
      createdAt:   new Date().toISOString(),
    };
    await this.redis.raw.setex(INTENT_KEY(userId), ttlSecs, JSON.stringify(payload));
    return payload;
  }

  async clearIntent(userId: string) {
    await this.redis.raw.del(INTENT_KEY(userId));
  }

  async getMyIntent(userId: string): Promise<SocialIntent | null> {
    const raw = await this.redis.raw.get(INTENT_KEY(userId));
    if (!raw) return null;
    try { return JSON.parse(raw) as SocialIntent; } catch { return null; }
  }

  async getNearbyIntents(lat: number, lng: number, radiusKm: number, viewerId: string): Promise<SocialIntent[]> {
    const keys = await this.redis.raw.keys('social:intent:*');
    const results: SocialIntent[] = [];
    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const intent = JSON.parse(raw) as SocialIntent;
        if (intent.userId === viewerId) continue;
        if (this.haversineKm(lat, lng, intent.lat, intent.lng) <= radiusKm) results.push(intent);
      } catch {}
    }
    return results.sort(
      (a, b) => this.haversineKm(lat, lng, a.lat, a.lng) - this.haversineKm(lat, lng, b.lat, b.lng),
    );
  }

  // ── Social Events (Redis-only, éphémères) ────────────────────────────────

  async createEvent(
    creatorId: string,
    dto: {
      displayName:   string;
      photoUrl?:     string;
      lat:           number;
      lng:           number;
      universe?:     string;
      title:         string;
      note?:         string;
      scheduledAt:   string;
      maxPeople?:    number;
    },
  ): Promise<SocialEvent> {
    const id = randomUUID();
    const scheduledMs = new Date(dto.scheduledAt).getTime();
    const ttlSecs = Math.max(3600, Math.floor((scheduledMs - Date.now()) / 1000) + 7200);
    const event: SocialEvent = {
      id,
      creatorId,
      creatorName:      dto.displayName,
      creatorPhotoUrl:  dto.photoUrl,
      lat:              dto.lat,
      lng:              dto.lng,
      universe:         dto.universe,
      title:            dto.title.slice(0, 80),
      note:             dto.note?.slice(0, 200),
      scheduledAt:      dto.scheduledAt,
      maxPeople:        Math.min(dto.maxPeople ?? 10, 100),
      participants:     [creatorId],
      createdAt:        new Date().toISOString(),
    };
    await this.redis.raw.setex(EVENT_KEY(id), ttlSecs, JSON.stringify(event));
    await this.redis.raw.zadd(EVENT_IDX, scheduledMs, id);
    await this.redis.raw.expire(EVENT_IDX, 172800);
    return event;
  }

  async getNearbyEvents(lat: number, lng: number, radiusKm: number): Promise<Array<SocialEvent & { distanceKm: number }>> {
    const now = Date.now();
    const ids = (await this.redis.raw.zrangebyscore(EVENT_IDX, now - 3_600_000, '+inf')) as string[];
    const results: Array<SocialEvent & { distanceKm: number }> = [];
    for (const id of ids) {
      const raw = await this.redis.raw.get(EVENT_KEY(id));
      if (!raw) continue;
      try {
        const event = JSON.parse(raw) as SocialEvent;
        const dist = this.haversineKm(lat, lng, event.lat, event.lng);
        if (dist <= radiusKm) results.push({ ...event, distanceKm: Math.round(dist * 10) / 10 });
      } catch {}
    }
    return results.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  async joinEvent(eventId: string, userId: string): Promise<SocialEvent> {
    const raw = await this.redis.raw.get(EVENT_KEY(eventId));
    if (!raw) throw new NotFoundException('Événement introuvable');
    const event = JSON.parse(raw) as SocialEvent;
    if (event.participants.length >= event.maxPeople) throw new ConflictException('Événement complet');
    if (!event.participants.includes(userId)) event.participants.push(userId);
    const ttl = await this.redis.raw.ttl(EVENT_KEY(eventId));
    await this.redis.raw.setex(EVENT_KEY(eventId), Math.max(ttl, 3600), JSON.stringify(event));
    return event;
  }

  async leaveEvent(eventId: string, userId: string): Promise<SocialEvent> {
    const raw = await this.redis.raw.get(EVENT_KEY(eventId));
    if (!raw) throw new NotFoundException('Événement introuvable');
    const event = JSON.parse(raw) as SocialEvent;
    event.participants = event.participants.filter((id) => id !== userId);
    const ttl = await this.redis.raw.ttl(EVENT_KEY(eventId));
    await this.redis.raw.setex(EVENT_KEY(eventId), Math.max(ttl, 3600), JSON.stringify(event));
    return event;
  }

  // ── Découverte publique (tous les utilisateurs visibles par tous) ─────────

  async discoverNearby(
    lat: number,
    lng: number,
    radiusKm: number,
    viewerId: string,
  ): Promise<Array<{ userId: string; lat: number; lng: number; distanceKm: number; intent: SocialIntent | null }>> {
    const keys = await this.redis.raw.keys(`${LOC_PREFIX}*`);
    const results: Array<{ userId: string; lat: number; lng: number; distanceKm: number; intent: SocialIntent | null }> = [];
    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as { lat: number; lng: number; visibility: string };
        const uid = key.slice(LOC_PREFIX.length);
        if (uid === viewerId) continue;
        if (loc.visibility !== 'everyone' && loc.visibility !== 'map') continue;
        const dist = this.haversineKm(lat, lng, loc.lat, loc.lng);
        if (dist > radiusKm) continue;
        const intentRaw = await this.redis.raw.get(INTENT_KEY(uid));
        const intent: SocialIntent | null = intentRaw ? (JSON.parse(intentRaw) as SocialIntent) : null;
        results.push({ userId: uid, lat: loc.lat, lng: loc.lng, distanceKm: Math.round(dist * 10) / 10, intent });
      } catch {}
    }
    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // ─────────────────────────────────────────────────────────────────────────

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
