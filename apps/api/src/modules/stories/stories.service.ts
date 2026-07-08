import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: {
    mediaUrl: string;
    type?: 'photo' | 'video';
    caption?: string;
    placeId?: string;
  }) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
    return this.prisma.story.create({
      data: {
        userId,
        mediaUrl: dto.mediaUrl,
        type: dto.type ?? 'photo',
        caption: dto.caption,
        placeId: dto.placeId,
        expiresAt,
      },
    });
  }

  /** Stories des gens que je suis + les miennes, non expirées */
  async getFeedStories(userId: string) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: userId } });
    const followingIds = [userId, ...follows.map((f) => f.followingId)];

    const stories = await this.prisma.story.findMany({
      where: {
        userId: { in: followingIds },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrichir avec infos user + vu ou non
    const userIds = [...new Set(stories.map((s) => s.userId))];
    const [users, myViews] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true },
      }),
      this.prisma.storyView.findMany({
        where: { userId, storyId: { in: stories.map((s) => s.id) } },
        select: { storyId: true },
      }),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const viewedIds = new Set(myViews.map((v) => v.storyId));

    // Grouper par user
    const byUser = new Map<string, typeof stories>();
    for (const s of stories) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId)!.push(s);
    }

    return [...byUser.entries()].map(([uid, userStories]) => ({
      user: userMap[uid],
      stories: userStories.map((s) => ({ ...s, seen: viewedIds.has(s.id) })),
      hasUnseen: userStories.some((s) => !viewedIds.has(s.id)),
    }));
  }

  async markViewed(storyId: string, userId: string) {
    await this.prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      update: {},
      create: { storyId, userId },
    });
    await this.prisma.story.update({
      where: { id: storyId },
      data: { viewCount: { increment: 1 } },
    });
  }

  async delete(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.userId !== userId) throw new ForbiddenException();
    return this.prisma.story.delete({ where: { id: storyId } });
  }

  /** Supprime les stories expirées toutes les heures */
  @Cron('0 * * * *')
  async purgeExpired() {
    await this.prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
