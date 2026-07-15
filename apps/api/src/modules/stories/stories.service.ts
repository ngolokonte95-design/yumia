import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { Cron } from '@nestjs/schedule';

/** Sticker posé sur une story (position en % du cadre). */
export interface StorySticker {
  kind: 'poll' | 'question' | 'mention' | 'location' | 'hashtag' | 'text' | 'emoji_slider' | 'countdown' | 'link';
  x: number;
  y: number;
  // poll / quiz
  question?: string;
  options?: string[];
  // mention / hashtag / location / link
  userId?: string;
  label?: string;
  placeId?: string;
  url?: string;
  // text / emoji_slider / countdown
  text?: string;
  emoji?: string;
  endsAt?: string;
  color?: string;
}

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  async create(userId: string, dto: {
    mediaUrl: string;
    type?: 'photo' | 'video';
    caption?: string;
    placeId?: string;
    closeFriendsOnly?: boolean;
    stickers?: StorySticker[];
  }) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h
    return this.prisma.story.create({
      data: {
        userId,
        mediaUrl: dto.mediaUrl,
        type: dto.type ?? 'photo',
        caption: dto.caption,
        placeId: dto.placeId,
        closeFriendsOnly: dto.closeFriendsOnly ?? false,
        stickers: dto.stickers ? (dto.stickers as unknown as Prisma.InputJsonValue) : undefined,
        expiresAt,
      },
    });
  }

  /** IDs dont les stories sont invisibles pour ce viewer (blocages 2 sens + stories masquées). */
  private async getExcludedUserIds(userId: string): Promise<Set<string>> {
    const [blocked, blockedBy, muted] = await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      this.prisma.mute.findMany({ where: { userId, muteStories: true }, select: { mutedId: true } }),
    ]);
    return new Set([
      ...blocked.map((b) => b.blockedId),
      ...blockedBy.map((b) => b.blockerId),
      ...muted.map((m) => m.mutedId),
    ]);
  }

  /** Auteurs dont je suis « ami proche » (je peux voir leurs stories close friends). */
  private async getCloseFriendAuthorIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.closeFriend.findMany({
      where: { friendId: userId },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /** Filtre close friends + blocages sur une liste de stories. */
  private async filterVisible<T extends { userId: string; closeFriendsOnly: boolean }>(stories: T[], viewerId: string): Promise<T[]> {
    const [excluded, cfAuthors] = await Promise.all([
      this.getExcludedUserIds(viewerId),
      this.getCloseFriendAuthorIds(viewerId),
    ]);
    return stories.filter((s) => {
      if (excluded.has(s.userId)) return false;
      if (s.closeFriendsOnly && s.userId !== viewerId && !cfAuthors.has(s.userId)) return false;
      return true;
    });
  }

  /** Stories des gens que je suis + les miennes, non expirées */
  async getFeedStories(userId: string) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: userId } });
    const followingIds = [userId, ...follows.map((f) => f.followingId)];

    const allStories = await this.prisma.story.findMany({
      where: {
        userId: { in: followingIds },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    const stories = await this.filterVisible(allStories, userId);

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
    const allStories = await this.prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const stories = await this.filterVisible(allStories, userId);

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

  /** Liste des personnes ayant vu la story (réservé à l'auteur). */
  async getViewers(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.userId !== userId) throw new ForbiddenException('Seul l\'auteur peut voir les vues.');
    const views = await this.prisma.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
      take: 200,
    });
    if (!views.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: views.map((v) => v.userId) } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return views
      .filter((v) => userMap[v.userId])
      .map((v) => ({ viewedAt: v.viewedAt, user: userMap[v.userId] }));
  }

  /** Vote sur le sticker sondage/quiz d'une story + résultats agrégés. */
  async votePoll(storyId: string, userId: string, optionIndex: number) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { id: true, stickers: true } });
    if (!story) throw new NotFoundException('Story introuvable');
    const stickers = (story.stickers as unknown as StorySticker[] | null) ?? [];
    const poll = stickers.find((s) => s.kind === 'poll' || s.kind === 'emoji_slider');
    if (!poll) throw new BadRequestException('Cette story n\'a pas de sondage.');
    if (poll.kind === 'poll' && (optionIndex < 0 || optionIndex >= (poll.options?.length ?? 0))) {
      throw new BadRequestException('Option invalide.');
    }
    await this.prisma.storyPollVote.upsert({
      where: { storyId_userId: { storyId, userId } },
      update: { optionIndex },
      create: { storyId, userId, optionIndex },
    });
    const votes = await this.prisma.storyPollVote.groupBy({
      by: ['optionIndex'],
      where: { storyId },
      _count: { userId: true },
    });
    const results = (poll.options ?? []).map((_, i) => votes.find((v) => v.optionIndex === i)?._count.userId ?? 0);
    return { results, myVote: optionIndex };
  }

  /** Résultats du sondage (auteur ou votant). */
  async getPollResults(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { userId: true, stickers: true } });
    if (!story) throw new NotFoundException('Story introuvable');
    const stickers = (story.stickers as unknown as StorySticker[] | null) ?? [];
    const poll = stickers.find((s) => s.kind === 'poll' || s.kind === 'emoji_slider');
    if (!poll) return { results: [], myVote: null };
    const [votes, mine] = await Promise.all([
      this.prisma.storyPollVote.groupBy({ by: ['optionIndex'], where: { storyId }, _count: { userId: true } }),
      this.prisma.storyPollVote.findUnique({ where: { storyId_userId: { storyId, userId } } }),
    ]);
    const results = (poll.options ?? ['', '']).map((_, i) => votes.find((v) => v.optionIndex === i)?._count.userId ?? 0);
    return { results, myVote: mine?.optionIndex ?? null };
  }

  /** Répond à une story → envoie un DM de type story_reply à son auteur. */
  async replyToStory(storyId: string, userId: string, text: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true, mediaUrl: true, expiresAt: true },
    });
    if (!story || story.expiresAt < new Date()) throw new NotFoundException('Story introuvable ou expirée');
    if (story.userId === userId) throw new BadRequestException('Impossible de répondre à sa propre story.');
    const conv = await this.chat.getOrCreateConversation(userId, story.userId);
    return this.chat.sendMessage(conv.id, userId, {
      content: text,
      type: 'story_reply',
      storyId,
      mediaUrl: story.mediaUrl,
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
