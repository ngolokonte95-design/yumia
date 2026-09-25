import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron } from '@nestjs/schedule';
import { assertClean } from '../../common/moderation/moderation';
import { StorageService } from '../../infra/storage/storage.service';
import { PrivacyService } from '../../infra/privacy/privacy.service';

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
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly privacy: PrivacyService,
  ) {}

  async create(userId: string, dto: {
    mediaUrl: string;
    type?: 'photo' | 'video';
    caption?: string;
    placeId?: string;
    closeFriendsOnly?: boolean;
    stickers?: StorySticker[];
    musicTrack?: string;
  }) {
    assertClean(dto.caption);
    // Les stickers texte sont du contenu publié au même titre que la légende.
    dto.stickers?.forEach((sticker) => assertClean(sticker.text));
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
        musicTrack: dto.musicTrack,
        expiresAt,
      },
    });
  }

  /**
   * IDs dont les stories sont invisibles pour ce viewer : blocages dans les
   * deux sens, comptes privés qu'il ne suit pas, stories masquées.
   */
  private async getExcludedUserIds(userId: string): Promise<Set<string>> {
    const [hidden, muted] = await Promise.all([
      this.privacy.hiddenAuthorIds(userId),
      this.prisma.mute.findMany({ where: { userId, muteStories: true }, select: { mutedId: true } }),
    ]);
    return new Set([...hidden, ...muted.map((m) => m.mutedId)]);
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
  /**
   * Lieux des stories, en une seule requête.
   *
   * `placeId` était stocké depuis toujours mais n'était jamais relu : le lieu
   * ne pouvait donc pas s'afficher. Mêmes champs que pour les publications
   * (cf. posts.service), pour que le mobile traite les deux pareil.
   */
  private async loadPlaces(stories: Array<{ placeId: string | null }>) {
    const ids = [...new Set(stories.map((s) => s.placeId).filter(Boolean))] as string[];
    if (!ids.length) return {} as Record<string, { id: string; name: string; universe: string; city: string }>;
    const places = await this.prisma.place.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, universe: true, city: true },
    });
    return Object.fromEntries(places.map((pl) => [pl.id, pl]));
  }

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
    const [users, myViews, placeMap] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true, plan: true },
      }),
      this.prisma.storyView.findMany({
        where: { userId, storyId: { in: stories.map((s) => s.id) } },
        select: { storyId: true },
      }),
      this.loadPlaces(stories),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const viewedIds = new Set(myViews.map((v) => v.storyId));

    // Grouper par user
    const byUser = new Map<string, typeof stories>();
    for (const s of stories) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId)!.push(s);
    }

    const groups = [...byUser.entries()].map(([uid, userStories]) => ({
      user: userMap[uid],
      stories: userStories.map((s) => ({
        ...s,
        seen: viewedIds.has(s.id),
        place: s.placeId ? (placeMap[s.placeId] ?? null) : null,
      })),
      hasUnseen: userStories.some((s) => !viewedIds.has(s.id)),
    }));

    // Comme Instagram : mes stories, puis celles pas encore vues, puis le
    // reste — chaque bloc gardant l'ordre de publication le plus récent.
    return groups.sort((a, b) => {
      if (a.user?.id === userId) return -1;
      if (b.user?.id === userId) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return 0;
    });
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
    const [users, myViews, placeMap] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true, plan: true },
      }),
      this.prisma.storyView.findMany({
        where: { userId, storyId: { in: stories.map((s) => s.id) } },
        select: { storyId: true },
      }),
      this.loadPlaces(stories),
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
      stories: userStories.map((s) => ({
        ...s,
        seen: viewedIds.has(s.id),
        place: s.placeId ? (placeMap[s.placeId] ?? null) : null,
      })),
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

  async getUserHighlights(userId: string, viewerId: string) {
    if (!(await this.privacy.canViewContent(viewerId, userId))) return [];
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
    const deleted = await this.prisma.storyHighlight.delete({
      where: { id: highlightId },
      include: { items: { select: { mediaUrl: true } } },
    });
    // Après la base, et seulement les fichiers que plus rien n'utilise : le
    // média d'une story à la une est le MÊME fichier que celui de la story
    // (l'app ne le duplique pas), et peut figurer dans d'autres « à la une ».
    await this.removeUnreferencedMedia([deleted.coverUrl, ...deleted.items.map((i) => i.mediaUrl)], userId);
    return deleted;
  }

  /**
   * Efface les fichiers de `ownerId` parmi `urls` qu'aucune de ses stories ni
   * aucune de ses stories à la une n'utilise encore.
   *
   * Sans ce contrôle, l'expiration d'une story (24 h) supprimait son fichier…
   * qui était aussi celui de l'élément « à la une » créé depuis elle : les
   * stories à la une perdaient toutes leur média le lendemain. Seules les
   * références du même propriétaire comptent — une « à la une » d'autrui
   * pointant sur ce fichier ne doit pas pouvoir le garder en vie.
   */
  private async removeUnreferencedMedia(urls: Array<string | null | undefined>, ownerId: string): Promise<void> {
    const candidates = [...new Set(urls.filter((u): u is string => !!u))];
    if (candidates.length === 0) return;
    const [items, covers, stories] = await Promise.all([
      this.prisma.storyHighlightItem.findMany({
        where: { mediaUrl: { in: candidates }, highlight: { userId: ownerId } },
        select: { mediaUrl: true },
      }),
      this.prisma.storyHighlight.findMany({
        where: { coverUrl: { in: candidates }, userId: ownerId },
        select: { coverUrl: true },
      }),
      this.prisma.story.findMany({
        where: { mediaUrl: { in: candidates }, userId: ownerId },
        select: { mediaUrl: true },
      }),
    ]);
    const used = new Set<string>([
      ...items.map((i) => i.mediaUrl),
      ...covers.map((c) => c.coverUrl).filter((u): u is string => !!u),
      ...stories.map((st) => st.mediaUrl),
    ]);
    const orphans = candidates.filter((u) => !used.has(u));
    if (orphans.length) await this.storage.removeMany(orphans, ownerId);
  }

  /**
   * Enregistre un spectateur.
   *
   * Une story se compte en personnes, pas en ouvertures : revenir la regarder
   * une deuxième fois ne doit pas faire monter le compteur. C'est ce
   * qu'exprime déjà `StoryView` (une ligne par personne), mais `viewCount`
   * était incrémenté à chaque appel, quelle qu'en soit l'issue — le nombre
   * affiché finissait par dépasser la liste des spectateurs, pourtant juste.
   *
   * Et l'auteur ne se compte pas parmi ses spectateurs : ni dans le nombre,
   * ni dans la liste.
   *
   * L'insertion sert de test : la contrainte d'unicité de `StoryView` tranche
   * en une requête, là où « lire puis écrire » laisserait deux ouvertures
   * simultanées compter deux fois la même personne.
   */
  async markViewed(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true },
    });
    if (!story || story.userId === userId) return;

    try {
      await this.prisma.storyView.create({ data: { storyId, userId } });
    } catch (err) {
      // P2002 : cette personne l'avait déjà vue. Rien à compter.
      if ((err as { code?: string }).code === 'P2002') return;
      throw err;
    }

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
      select: { id: true, displayName: true, photoUrl: true, plan: true },
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
    await this.privacy.assertCanViewContent(userId, story.userId);
    const conv = await this.chat.getOrCreateConversation(userId, story.userId);
    const message = await this.chat.sendMessage(conv.id, userId, {
      content: text,
      type: 'story_reply',
      storyId,
      mediaUrl: story.mediaUrl,
    });
    const replier = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    void this.notifications.sendToUser(
      story.userId,
      '↩️ Réponse à votre story',
      `${replier?.displayName ?? 'Quelqu\'un'} a répondu : ${text.slice(0, 60)}`,
      // `actorId` : permet d'effacer cette notification si l'auteur de la
      // réponse supprime son compte (cf. AuthService.deleteAccount).
      { type: 'story_reply', storyId, actorId: userId },
    );
    return message;
  }

  async delete(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.userId !== userId) throw new ForbiddenException();
    const deleted = await this.prisma.story.delete({ where: { id: storyId } });
    // Le fichier reste s'il est aussi celui d'une story à la une.
    void this.removeUnreferencedMedia([story.mediaUrl], story.userId).catch(() => undefined);
    return deleted;
  }

  /**
   * Supprime les stories expirées toutes les heures — fichiers compris.
   *
   * Les médias étaient laissés sur le disque : une story de 9 Mo effacée de la
   * base restait 9 Mo occupés, pour toujours. C'est la fuite la plus rapide de
   * l'app, puisque TOUTES les stories expirent au bout de 24 h.
   */
  @Cron('0 * * * *')
  async purgeExpired() {
    const expired = await this.prisma.story.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, userId: true, mediaUrl: true },
    });
    if (expired.length === 0) return;

    await this.prisma.story.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
    // Après la base : un fichier orphelin se rattrape, une story rendue
    // invisible dont le fichier existe encore ne gêne personne. L'inverse —
    // fichier supprimé, ligne conservée — casserait l'affichage.
    // Les fichiers repris dans une story à la une sont conservés.
    const byOwner = new Map<string, string[]>();
    for (const st of expired) byOwner.set(st.userId, [...(byOwner.get(st.userId) ?? []), st.mediaUrl]);
    await Promise.all([...byOwner].map(([ownerId, urls]) => this.removeUnreferencedMedia(urls, ownerId)));
  }
}
