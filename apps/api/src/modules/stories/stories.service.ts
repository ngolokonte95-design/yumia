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

  /**
   * Stories GLOBALES : toutes les stories actives de tous les utilisateurs Yumia
   * (façon barre de stories « Pour vous »), groupées par utilisateur. Le user
   * courant est renvoyé en tête si il a une story active.
   */
  async getGlobalStories(userId: string) {
    const stories = await this.prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

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

    const byUser = new Map<string, typeof stories>();
    for (const s of stories) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId)!.push(s);
    }

    const groups = [...byUser.entries()].map(([uid, userStories]) => ({
      user: userMap[uid],
      stories: userStories.map((s) => ({ ...s, seen: viewedIds.has(s.id) })),
      hasUnseen: userStories.some((s) => !viewedIds.has(s.id)),
    }));

    // Mes stories d'abord, puis non-vues, puis le reste
    return groups.sort((a, b) => {
      if (a.user?.id === userId) return -1;
      if (b.user?.id === userId) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return 0;
    });
  }

  // ── Stories à la une (highlights) ─────────────────────────────────────────

  async createHighlight(userId: string, title: string, items: Array<{ mediaUrl: string; type?: 'photo' | 'video'; caption?: string }>) {
    return this.prisma.storyHighlight.create({
      data: {
        userId,
        title,
        coverUrl: items[0]?.mediaUrl,
        items: {
          create: items.map((it, i) => ({
            mediaUrl: it.mediaUrl,
            type: it.type ?? 'photo',
            caption: it.caption,
            order: i,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async getUserHighlights(userId: string) {
    return this.prisma.storyHighlight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async addItemToHighlight(userId: string, highlightId: string, item: { mediaUrl: string; type?: 'photo' | 'video'; caption?: string }) {
    const highlight = await this.prisma.storyHighlight.findUnique({ where: { id: highlightId }, select: { userId: true } });
    if (!highlight) throw new NotFoundException('Story à la une introuvable');
    if (highlight.userId !== userId) throw new ForbiddenException();
    const count = await this.prisma.storyHighlightItem.count({ where: { highlightId } });
    return this.prisma.storyHighlightItem.create({
      data: { highlightId, mediaUrl: item.mediaUrl, type: item.type ?? 'photo', caption: item.caption, order: count },
    });
  }

  async deleteHighlight(userId: string, highlightId: string) {
    const highlight = await this.prisma.storyHighlight.findUnique({ where: { id: highlightId }, select: { userId: true } });
    if (!highlight) throw new NotFoundException('Story à la une introuvable');
    if (highlight.userId !== userId) throw new ForbiddenException();
    return this.prisma.storyHighlight.delete({ where: { id: highlightId } });
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
