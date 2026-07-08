import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: {
        id: true, displayName: true, photoUrl: true, bio: true,
        totalXp: true, level: true, createdAt: true,
      },
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
}
