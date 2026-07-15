import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { Post } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Extrait les hashtags (#mot) d'une légende, en minuscules, sans doublon. */
function extractHashtags(caption?: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#([\p{L}\p{N}_]+)/gu) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].slice(0, 30);
}

export interface CreatePostOptions {
  placeId?: string;
  videoUrl?: string;
  musicTrack?: string;
  taggedUserIds?: string[];
  collabUserId?: string;
  coverUrl?: string;
  commentsDisabled?: boolean;
  hideLikeCount?: boolean;
  isDraft?: boolean;
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(
    userId: string,
    caption: string | undefined,
    mediaUrls: string[],
    opts: CreatePostOptions = {},
  ) {
    return this.prisma.post.create({
      data: {
        userId,
        caption,
        mediaUrls,
        placeId: opts.placeId,
        videoUrl: opts.videoUrl,
        musicTrack: opts.musicTrack,
        taggedUserIds: opts.taggedUserIds ?? [],
        collabUserId: opts.collabUserId,
        coverUrl: opts.coverUrl,
        commentsDisabled: opts.commentsDisabled ?? false,
        hideLikeCount: opts.hideLikeCount ?? false,
        isDraft: opts.isDraft ?? false,
        hashtags: extractHashtags(caption),
      },
    });
  }

  /** Modifie un post existant (légende, lieu, tags, options) — façon « Modifier » d'Instagram. */
  async editPost(
    userId: string,
    postId: string,
    patch: { caption?: string; placeId?: string | null; taggedUserIds?: string[]; commentsDisabled?: boolean; hideLikeCount?: boolean; coverUrl?: string },
  ) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...(patch.caption !== undefined ? { caption: patch.caption, hashtags: extractHashtags(patch.caption) } : {}),
        ...(patch.placeId !== undefined ? { placeId: patch.placeId } : {}),
        ...(patch.taggedUserIds !== undefined ? { taggedUserIds: patch.taggedUserIds } : {}),
        ...(patch.commentsDisabled !== undefined ? { commentsDisabled: patch.commentsDisabled } : {}),
        ...(patch.hideLikeCount !== undefined ? { hideLikeCount: patch.hideLikeCount } : {}),
        ...(patch.coverUrl !== undefined ? { coverUrl: patch.coverUrl } : {}),
        editedAt: new Date(),
      },
    });
  }

  /** Épingle/désépingle un post en haut du profil (max 3 épinglés). */
  async togglePin(userId: string, postId: string): Promise<{ pinned: boolean }> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true, pinned: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    if (!post.pinned) {
      const pinnedCount = await this.prisma.post.count({ where: { userId, pinned: true } });
      if (pinnedCount >= 3) throw new BadRequestException('Maximum 3 posts épinglés.');
    }
    const updated = await this.prisma.post.update({ where: { id: postId }, data: { pinned: !post.pinned }, select: { pinned: true } });
    return { pinned: updated.pinned };
  }

  /** Archive/désarchive un post (masqué du profil et des feeds, sans suppression). */
  async toggleArchive(userId: string, postId: string): Promise<{ archived: boolean }> {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true, archived: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    const updated = await this.prisma.post.update({ where: { id: postId }, data: { archived: !post.archived, pinned: false }, select: { archived: true } });
    return { archived: updated.archived };
  }

  /** Posts archivés de l'utilisateur. */
  async getArchived(userId: string, limit = 30) {
    const posts = await this.prisma.post.findMany({
      where: { userId, archived: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.hydratePosts(posts, userId);
  }

  /** Brouillons non publiés. */
  async getDrafts(userId: string, limit = 30) {
    const posts = await this.prisma.post.findMany({
      where: { userId, isDraft: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.hydratePosts(posts, userId);
  }

  /** Publie un brouillon. */
  async publishDraft(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true, isDraft: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    if (!post.isDraft) throw new BadRequestException('Ce post est déjà publié.');
    return this.prisma.post.update({ where: { id: postId }, data: { isDraft: false, createdAt: new Date() } });
  }

  /** Comptabilise une vue (stats). */
  async recordView(postId: string) {
    await this.prisma.post.update({ where: { id: postId }, data: { viewsCount: { increment: 1 } } }).catch(() => undefined);
    return { ok: true };
  }

  /** Statistiques d'un post (réservé à l'auteur). */
  async getStats(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, likesCount: true, viewsCount: true, createdAt: true },
    });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    const [commentsCount, savesCount, repostsCount] = await Promise.all([
      this.prisma.postComment.count({ where: { postId } }),
      this.prisma.postSave.count({ where: { postId } }),
      this.prisma.repost.count({ where: { postId } }),
    ]);
    return {
      views: post.viewsCount,
      likes: post.likesCount,
      comments: commentsCount,
      saves: savesCount,
      reposts: repostsCount,
      createdAt: post.createdAt,
    };
  }

  /** Posts contenant un hashtag donné. */
  async getHashtagPosts(viewerId: string, tag: string, limit = 30) {
    const posts = await this.prisma.post.findMany({
      where: { hashtags: { has: tag.toLowerCase() }, archived: false, isDraft: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.hydratePosts(posts, viewerId);
  }

  /** IDs des utilisateurs à exclure des feeds (blocages dans les 2 sens + posts masqués). */
  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocked, blockedBy, muted] = await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
      this.prisma.mute.findMany({ where: { userId, mutePosts: true }, select: { mutedId: true } }),
    ]);
    return [
      ...blocked.map((b) => b.blockedId),
      ...blockedBy.map((b) => b.blockerId),
      ...muted.map((m) => m.mutedId),
    ];
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.post.delete({ where: { id: postId } });
  }

  async getFeed(userId: string, limit = 30, cursor?: string) {
    const [follows, excluded, favorites] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
      this.getExcludedUserIds(userId),
      this.prisma.favoriteUser.findMany({ where: { userId }, select: { favoriteId: true } }),
    ]);
    const excludedSet = new Set(excluded);
    const ids = [userId, ...follows.map((f) => f.followingId)].filter((id) => !excludedSet.has(id));

    const posts = await this.prisma.post.findMany({
      where: { userId: { in: ids }, archived: false, isDraft: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    // Les comptes favoris remontent en tête du feed (façon « Favoris » d'Instagram).
    const favoriteSet = new Set(favorites.map((f) => f.favoriteId));
    const sorted = [...posts].sort((a, b) => {
      const aFav = favoriteSet.has(a.userId) ? 0 : 1;
      const bFav = favoriteSet.has(b.userId) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return this.hydratePosts(sorted, userId);
  }

  /**
   * Feed GLOBAL : toutes les publications de tous les utilisateurs Yumia,
   * même ceux qu'on ne suit pas (façon « Pour vous » d'Instagram).
   */
  async getGlobalFeed(userId: string, limit = 30, cursor?: string) {
    const excluded = await this.getExcludedUserIds(userId);
    const posts = await this.prisma.post.findMany({
      where: {
        archived: false,
        isDraft: false,
        ...(excluded.length ? { userId: { notIn: excluded } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return this.hydratePosts(posts, userId);
  }

  /** Bascule l'enregistrement (bookmark) d'un post. */
  async toggleSave(userId: string, postId: string): Promise<{ saved: boolean }> {
    const existing = await this.prisma.postSave.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.postSave.delete({ where: { postId_userId: { postId, userId } } });
      return { saved: false };
    }
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    await this.prisma.postSave.create({ data: { postId, userId } });
    return { saved: true };
  }

  /** Posts enregistrés par l'utilisateur (optionnellement filtrés par collection). */
  async getSavedPosts(userId: string, limit = 30, collectionId?: string) {
    const saves = await this.prisma.postSave.findMany({
      where: { userId, ...(collectionId ? { collectionId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { postId: true },
    });
    if (!saves.length) return [];
    const posts = await this.prisma.post.findMany({
      where: { id: { in: saves.map((s) => s.postId) } },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydratePosts(posts, userId);
  }

  // ── Collections de sauvegardes ─────────────────────────────────────────────

  async listCollections(userId: string) {
    const collections = await this.prisma.savedCollection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const counts = await this.prisma.postSave.groupBy({
      by: ['collectionId'],
      where: { userId, collectionId: { in: collections.map((c) => c.id) } },
      _count: { postId: true },
    });
    const countMap = Object.fromEntries(counts.map((c) => [c.collectionId, c._count.postId]));
    return collections.map((c) => ({ ...c, itemsCount: countMap[c.id] ?? 0 }));
  }

  async createCollection(userId: string, name: string) {
    if (!name?.trim()) throw new BadRequestException('Nom de collection requis.');
    return this.prisma.savedCollection.create({ data: { userId, name: name.trim() } });
  }

  async deleteCollection(userId: string, collectionId: string) {
    const col = await this.prisma.savedCollection.findUnique({ where: { id: collectionId }, select: { userId: true } });
    if (!col) throw new NotFoundException('Collection introuvable');
    if (col.userId !== userId) throw new ForbiddenException();
    // Les sauvegardes redeviennent « sans collection » (on ne les supprime pas).
    await this.prisma.postSave.updateMany({ where: { userId, collectionId }, data: { collectionId: null } });
    await this.prisma.savedCollection.delete({ where: { id: collectionId } });
    return { ok: true };
  }

  /** Range un post enregistré dans une collection (ou l'en retire avec null). */
  async setSaveCollection(userId: string, postId: string, collectionId: string | null) {
    const save = await this.prisma.postSave.findUnique({ where: { postId_userId: { postId, userId } } });
    if (!save) throw new NotFoundException('Post non enregistré');
    if (collectionId) {
      const col = await this.prisma.savedCollection.findUnique({ where: { id: collectionId }, select: { userId: true, coverUrl: true } });
      if (!col || col.userId !== userId) throw new NotFoundException('Collection introuvable');
      // Première image du post comme couverture si la collection n'en a pas.
      if (!col.coverUrl) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { mediaUrls: true } });
        if (post?.mediaUrls[0]) {
          await this.prisma.savedCollection.update({ where: { id: collectionId }, data: { coverUrl: post.mediaUrls[0] } });
        }
      }
    }
    await this.prisma.postSave.update({
      where: { postId_userId: { postId, userId } },
      data: { collectionId },
    });
    return { ok: true };
  }

  /** Bascule la republication d'un post. */
  async toggleRepost(userId: string, postId: string, caption?: string): Promise<{ reposted: boolean; repostsCount: number }> {
    const existing = await this.prisma.repost.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.repost.delete({ where: { postId_userId: { postId, userId } } });
    } else {
      const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) throw new NotFoundException('Post introuvable');
      await this.prisma.repost.create({ data: { postId, userId, caption } });
    }
    const repostsCount = await this.prisma.repost.count({ where: { postId } });
    return { reposted: !existing, repostsCount };
  }

  async getUserPosts(targetUserId: string, viewerId: string, limit = 30, cursor?: string) {
    const posts = await this.prisma.post.findMany({
      where: { userId: targetUserId, archived: false, isDraft: false },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return this.hydratePosts(posts, viewerId);
  }

  /** Posts où l'utilisateur est identifié (onglet « Identifié » du profil). */
  async getTaggedPosts(targetUserId: string, viewerId: string, limit = 30) {
    const posts = await this.prisma.post.findMany({
      where: { taggedUserIds: { has: targetUserId }, archived: false, isDraft: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.hydratePosts(posts, viewerId);
  }

  async getPost(postId: string, viewerId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post introuvable');

    const [hydrated] = await this.hydratePosts([post], viewerId);
    const comments = await this.getComments(postId, viewerId);
    return { ...hydrated, comments };
  }

  async toggleLike(userId: string, postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await this.prisma.postLike.delete({ where: { postId_userId: { postId, userId } } });
      const updated = await this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
        select: { likesCount: true },
      });
      return { liked: false, likesCount: updated.likesCount };
    } else {
      await this.prisma.postLike.create({ data: { postId, userId } });
      const updated = await this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
        select: { likesCount: true },
      });
      return { liked: true, likesCount: updated.likesCount };
    }
  }

  async addComment(userId: string, postId: string, content: string, parentId?: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, commentsDisabled: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.commentsDisabled) throw new ForbiddenException('Les commentaires sont désactivés sur ce post.');
    if (parentId) {
      const parent = await this.prisma.postComment.findUnique({ where: { id: parentId }, select: { postId: true } });
      if (!parent || parent.postId !== postId) throw new NotFoundException('Commentaire parent introuvable');
    }
    return this.prisma.postComment.create({ data: { userId, postId, content, parentId } });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { userId: true, id: true } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    // Supprime aussi les réponses du fil.
    await this.prisma.postComment.deleteMany({ where: { parentId: commentId } });
    await this.prisma.postComment.delete({ where: { id: commentId } });
  }

  /** Like/unlike d'un commentaire. */
  async toggleCommentLike(userId: string, commentId: string): Promise<{ liked: boolean; likesCount: number }> {
    const existing = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    if (existing) {
      await this.prisma.commentLike.delete({ where: { commentId_userId: { commentId, userId } } });
      const updated = await this.prisma.postComment.update({
        where: { id: commentId }, data: { likesCount: { decrement: 1 } }, select: { likesCount: true },
      });
      return { liked: false, likesCount: Math.max(0, updated.likesCount) };
    }
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { id: true } });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    await this.prisma.commentLike.create({ data: { commentId, userId } });
    const updated = await this.prisma.postComment.update({
      where: { id: commentId }, data: { likesCount: { increment: 1 } }, select: { likesCount: true },
    });
    return { liked: true, likesCount: updated.likesCount };
  }

  /** Épingle/désépingle un commentaire (réservé à l'auteur du post). */
  async toggleCommentPin(userId: string, commentId: string): Promise<{ pinned: boolean }> {
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { postId: true, pinned: true } });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    const post = await this.prisma.post.findUnique({ where: { id: comment.postId }, select: { userId: true } });
    if (post?.userId !== userId) throw new ForbiddenException('Seul l\'auteur du post peut épingler.');
    const updated = await this.prisma.postComment.update({ where: { id: commentId }, data: { pinned: !comment.pinned }, select: { pinned: true } });
    return { pinned: updated.pinned };
  }

  /** Commentaires en fil : racines (épinglés d'abord) + réponses imbriquées + likedByMe. */
  async getComments(postId: string, viewerId?: string) {
    const comments = await this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    if (!comments.length) return [];
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const [users, myLikes] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true },
      }),
      viewerId
        ? this.prisma.commentLike.findMany({
            where: { userId: viewerId, commentId: { in: comments.map((c) => c.id) } },
            select: { commentId: true },
          })
        : Promise.resolve([]),
    ]);
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const likedSet = new Set(myLikes.map((l) => l.commentId));

    const enrich = (c: (typeof comments)[number]) => ({
      ...c,
      user: userMap[c.userId] ?? null,
      likedByMe: likedSet.has(c.id),
    });

    const roots = comments.filter((c) => !c.parentId);
    const repliesByParent = new Map<string, typeof comments>();
    for (const c of comments) {
      if (!c.parentId) continue;
      if (!repliesByParent.has(c.parentId)) repliesByParent.set(c.parentId, []);
      repliesByParent.get(c.parentId)!.push(c);
    }

    return roots
      .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
      .map((root) => ({
        ...enrich(root),
        replies: (repliesByParent.get(root.id) ?? []).map(enrich),
      }));
  }

  private async hydratePosts(posts: Post[], viewerId: string) {
    if (!posts.length) return [];

    const postIds = posts.map((p) => p.id);
    const userIds = [...new Set(posts.map((p) => p.userId))];
    const placeIds = [...new Set(posts.map((p) => p.placeId).filter(Boolean))] as string[];

    const [users, likes, saves, reposts, places, commentGroups, repostGroups] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true },
      }),
      this.prisma.postLike.findMany({
        where: { postId: { in: postIds }, userId: viewerId },
        select: { postId: true },
      }),
      this.prisma.postSave.findMany({
        where: { postId: { in: postIds }, userId: viewerId },
        select: { postId: true },
      }),
      this.prisma.repost.findMany({
        where: { postId: { in: postIds }, userId: viewerId },
        select: { postId: true },
      }),
      placeIds.length
        ? this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: { id: true, name: true, universe: true, city: true },
          })
        : Promise.resolve([]),
      this.prisma.postComment.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { postId: true } }),
      this.prisma.repost.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { postId: true } }),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const likedSet = new Set(likes.map((l) => l.postId));
    const savedSet = new Set(saves.map((s) => s.postId));
    const repostedSet = new Set(reposts.map((r) => r.postId));
    const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));
    const commentsCountMap = Object.fromEntries(commentGroups.map((g) => [g.postId, g._count.postId]));
    const repostsCountMap = Object.fromEntries(repostGroups.map((g) => [g.postId, g._count.postId]));

    return posts.map((p) => ({
      ...p,
      user: userMap[p.userId] ?? null,
      likedByMe: likedSet.has(p.id),
      savedByMe: savedSet.has(p.id),
      repostedByMe: repostedSet.has(p.id),
      commentsCount: commentsCountMap[p.id] ?? 0,
      repostsCount: repostsCountMap[p.id] ?? 0,
      place: p.placeId ? (placeMap[p.placeId] ?? null) : null,
    }));
  }
}
