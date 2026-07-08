import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(userId: string, caption: string | undefined, mediaUrls: string[], placeId?: string) {
    return this.prisma.post.create({
      data: { userId, caption, mediaUrls, placeId },
    });
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    if (post.userId !== userId) throw new ForbiddenException();
    await this.prisma.post.delete({ where: { id: postId } });
  }

  async getFeed(userId: string, limit = 30, cursor?: string) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
    const ids = [userId, ...follows.map((f) => f.followingId)];

    const posts = await this.prisma.post.findMany({
      where: { userId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    return this.hydratePosts(posts, userId);
  }

  async getUserPosts(targetUserId: string, viewerId: string, limit = 30, cursor?: string) {
    const posts = await this.prisma.post.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return this.hydratePosts(posts, viewerId);
  }

  async getPost(postId: string, viewerId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post introuvable');

    const [hydrated] = await this.hydratePosts([post], viewerId);
    const comments = await this.getComments(postId);
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

  async addComment(userId: string, postId: string, content: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post introuvable');
    return this.prisma.postComment.create({ data: { userId, postId, content } });
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.postComment.findUnique({ where: { id: commentId }, select: { userId: true } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    await this.prisma.postComment.delete({ where: { id: commentId } });
  }

  async getComments(postId: string) {
    const comments = await this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (!comments.length) return [];
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return comments.map((c) => ({ ...c, user: userMap[c.userId] ?? null }));
  }

  private async hydratePosts(posts: Array<{ id: string; userId: string; caption: string | null; mediaUrls: string[]; placeId: string | null; likesCount: number; createdAt: Date; updatedAt: Date }>, viewerId: string) {
    if (!posts.length) return [];

    const postIds = posts.map((p) => p.id);
    const userIds = [...new Set(posts.map((p) => p.userId))];
    const placeIds = [...new Set(posts.map((p) => p.placeId).filter(Boolean))] as string[];

    const [users, likes, places] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, photoUrl: true },
      }),
      this.prisma.postLike.findMany({
        where: { postId: { in: postIds }, userId: viewerId },
        select: { postId: true },
      }),
      placeIds.length
        ? this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: { id: true, name: true, universe: true, city: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const likedSet = new Set(likes.map((l) => l.postId));
    const placeMap = Object.fromEntries(places.map((p) => [p.id, p]));

    return posts.map((p) => ({
      ...p,
      user: userMap[p.userId] ?? null,
      likedByMe: likedSet.has(p.id),
      place: p.placeId ? (placeMap[p.placeId] ?? null) : null,
    }));
  }
}
