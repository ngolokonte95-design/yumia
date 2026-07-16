import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notifications: NotificationsService,
  ) {}

  // ── Follow / Unfollow ────────────────────────────────────────────────────

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new ConflictException('Impossible de se suivre soi-même');
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, isPrivate: true },
    });
    if (!target) throw new NotFoundException('Utilisateur introuvable');

    // Déjà abonné → idempotent.
    const already = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (already) return { status: 'following' as const };

    // Compte privé → demande d'abonnement au lieu d'un follow direct.
    if (target.isPrivate) {
      await this.prisma.followRequest.upsert({
        where: { requesterId_targetId: { requesterId: followerId, targetId: followingId } },
        update: {},
        create: { requesterId: followerId, targetId: followingId },
      });
      return { status: 'requested' as const };
    }

    await this.prisma.follow.create({ data: { followerId, followingId } });
    const follower = await this.prisma.user.findUnique({ where: { id: followerId }, select: { displayName: true } });
    void this.notifications.sendToUser(
      followingId,
      '👤 Nouvel abonné',
      `${follower?.displayName ?? 'Quelqu\'un'} a commencé à vous suivre`,
      { type: 'new_follower', followerId },
    );
    return { status: 'following' as const };
  }

  async unfollow(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });
    // Annule aussi une éventuelle demande en attente.
    await this.prisma.followRequest.deleteMany({ where: { requesterId: followerId, targetId: followingId } });
  }

  // ── Comptes privés & demandes d'abonnement ─────────────────────────────────

  async setPrivacy(userId: string, isPrivate: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { isPrivate } });
    return { isPrivate };
  }

  /** Demandes d'abonnement reçues (comptes privés), avec le profil du demandeur. */
  async listFollowRequests(userId: string) {
    const requests = await this.prisma.followRequest.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!requests.length) return [];
    const requesters = await this.prisma.user.findMany({
      where: { id: { in: requests.map((r) => r.requesterId) } },
      select: { id: true, displayName: true, photoUrl: true, bio: true },
    });
    const byId = Object.fromEntries(requesters.map((u) => [u.id, u]));
    return requests
      .filter((r) => byId[r.requesterId])
      .map((r) => ({ id: r.id, createdAt: r.createdAt, requester: byId[r.requesterId] }));
  }

  /** Accepte (crée le Follow) ou refuse une demande, puis la supprime. */
  async respondToRequest(userId: string, requestId: string, accept: boolean) {
    const req = await this.prisma.followRequest.findUnique({ where: { id: requestId } });
    if (!req || req.targetId !== userId) throw new NotFoundException('Demande introuvable');
    if (accept) {
      await this.prisma.follow.upsert({
        where: { followerId_followingId: { followerId: req.requesterId, followingId: userId } },
        update: {},
        create: { followerId: req.requesterId, followingId: userId },
      });
    }
    await this.prisma.followRequest.delete({ where: { id: requestId } });
    return { status: accept ? 'accepted' : 'rejected' };
  }

  // ── Modération : bloquer / restreindre / masquer / signaler ────────────────

  /** Bloque un compte : supprime les follows dans les deux sens + demandes. */
  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new ConflictException('Impossible de se bloquer soi-même');
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      }),
      this.prisma.followRequest.deleteMany({
        where: {
          OR: [
            { requesterId: blockerId, targetId: blockedId },
            { requesterId: blockedId, targetId: blockerId },
          ],
        },
      }),
    ]);
    return { blocked: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { blocked: false };
  }

  async listBlocked(userId: string) {
    const blocks = await this.prisma.block.findMany({ where: { blockerId: userId }, orderBy: { createdAt: 'desc' } });
    if (!blocks.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: blocks.map((b) => b.blockedId) } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    return users;
  }

  async restrict(userId: string, restrictedId: string) {
    await this.prisma.restrict.upsert({
      where: { userId_restrictedId: { userId, restrictedId } },
      update: {},
      create: { userId, restrictedId },
    });
    return { restricted: true };
  }

  async unrestrict(userId: string, restrictedId: string) {
    await this.prisma.restrict.deleteMany({ where: { userId, restrictedId } });
    return { restricted: false };
  }

  async mute(userId: string, mutedId: string, mutePosts = true, muteStories = true) {
    await this.prisma.mute.upsert({
      where: { userId_mutedId: { userId, mutedId } },
      update: { mutePosts, muteStories },
      create: { userId, mutedId, mutePosts, muteStories },
    });
    return { muted: true };
  }

  async unmute(userId: string, mutedId: string) {
    await this.prisma.mute.deleteMany({ where: { userId, mutedId } });
    return { muted: false };
  }

  async report(reporterId: string, dto: { targetType: string; targetId: string; reason: string; details?: string }) {
    const validTypes = new Set(['post', 'comment', 'story', 'user', 'message']);
    if (!validTypes.has(dto.targetType)) throw new ConflictException('Type de cible invalide');
    await this.prisma.report.create({
      data: { reporterId, targetType: dto.targetType, targetId: dto.targetId, reason: dto.reason, details: dto.details },
    });
    return { reported: true };
  }

  /** État de ma relation de modération avec un compte (pour le menu «…» du profil). */
  async getRelationState(userId: string, targetId: string) {
    const [block, restrictRow, muteRow, closeFriend, favorite] = await Promise.all([
      this.prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } } }),
      this.prisma.restrict.findUnique({ where: { userId_restrictedId: { userId, restrictedId: targetId } } }),
      this.prisma.mute.findUnique({ where: { userId_mutedId: { userId, mutedId: targetId } } }),
      this.prisma.closeFriend.findUnique({ where: { userId_friendId: { userId, friendId: targetId } } }),
      this.prisma.favoriteUser.findUnique({ where: { userId_favoriteId: { userId, favoriteId: targetId } } }),
    ]);
    return {
      blocked: !!block,
      restricted: !!restrictRow,
      muted: !!muteRow,
      mutePosts: muteRow?.mutePosts ?? false,
      muteStories: muteRow?.muteStories ?? false,
      closeFriend: !!closeFriend,
      favorite: !!favorite,
    };
  }

  // ── Amis proches + favoris ──────────────────────────────────────────────────

  async listCloseFriends(userId: string) {
    const rows = await this.prisma.closeFriend.findMany({ where: { userId } });
    if (!rows.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.friendId) } },
      select: { id: true, displayName: true, photoUrl: true },
    });
  }

  async addCloseFriend(userId: string, friendId: string) {
    await this.prisma.closeFriend.upsert({
      where: { userId_friendId: { userId, friendId } },
      update: {},
      create: { userId, friendId },
    });
    return { closeFriend: true };
  }

  async removeCloseFriend(userId: string, friendId: string) {
    await this.prisma.closeFriend.deleteMany({ where: { userId, friendId } });
    return { closeFriend: false };
  }

  async listFavorites(userId: string) {
    const rows = await this.prisma.favoriteUser.findMany({ where: { userId } });
    if (!rows.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.favoriteId) } },
      select: { id: true, displayName: true, photoUrl: true },
    });
  }

  async addFavorite(userId: string, favoriteId: string) {
    await this.prisma.favoriteUser.upsert({
      where: { userId_favoriteId: { userId, favoriteId } },
      update: {},
      create: { userId, favoriteId },
    });
    return { favorite: true };
  }

  async removeFavorite(userId: string, favoriteId: string) {
    await this.prisma.favoriteUser.deleteMany({ where: { userId, favoriteId } });
    return { favorite: false };
  }

  // ── Notes (statut 24h dans les DM) ──────────────────────────────────────────

  async setNote(userId: string, text: string) {
    const trimmed = text?.trim();
    if (!trimmed) throw new ConflictException('Texte de note requis');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.note.upsert({
      where: { userId },
      update: { text: trimmed.slice(0, 60), expiresAt, createdAt: new Date() },
      create: { userId, text: trimmed.slice(0, 60), expiresAt },
    });
  }

  async deleteNote(userId: string) {
    await this.prisma.note.deleteMany({ where: { userId } });
    return { ok: true };
  }

  /** Notes actives : la mienne + celles des gens que je suis. */
  async getNotes(userId: string) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
    const ids = [userId, ...follows.map((f) => f.followingId)];
    const notes = await this.prisma.note.findMany({
      where: { userId: { in: ids }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!notes.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: notes.map((n) => n.userId) } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    // Ma note en premier.
    return notes
      .sort((a, b) => (a.userId === userId ? -1 : b.userId === userId ? 1 : 0))
      .map((n) => ({ ...n, user: userMap[n.userId] ?? null }));
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const f = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return !!f;
  }

  // ── User discovery ───────────────────────────────────────────────────────

  async searchUsers(query: string, limit = 20, viewerId?: string) {
    // Exclut les comptes bloqués (dans les deux sens).
    let excluded: string[] = [];
    if (viewerId) {
      const [blocked, blockedBy] = await Promise.all([
        this.prisma.block.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
        this.prisma.block.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
      ]);
      excluded = [...blocked.map((b) => b.blockedId), ...blockedBy.map((b) => b.blockerId)];
    }
    return this.prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        ...(excluded.length ? { id: { notIn: excluded } } : {}),
      },
      select: { id: true, displayName: true, photoUrl: true, bio: true, totalXp: true, level: true },
      take: limit,
    });
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, photoUrl: true, bio: true, totalXp: true, level: true, createdAt: true, isPrivate: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    const [followersCount, followingCount, visitCount, isFollowed, requested] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.prisma.visit.count({ where: { userId } }),
      viewerId ? this.isFollowing(viewerId, userId) : false,
      viewerId
        ? this.prisma.followRequest
            .findUnique({ where: { requesterId_targetId: { requesterId: viewerId, targetId: userId } } })
            .then((r) => !!r)
        : false,
    ]);
    return { ...user, followersCount, followingCount, visitCount, isFollowedByMe: isFollowed, hasRequestedByMe: requested };
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
