import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import type { MessageType } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface SendMessageOptions {
  content: string;
  type?: MessageType;
  mediaUrl?: string;
  placeId?: string;
  postId?: string;
  storyId?: string;
  replyToId?: string;
  durationSec?: number;
  oneTime?: boolean;
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(userAId: string, userBId: string) {
    // Blocage dans un sens ou l'autre → pas de conversation.
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
    });
    if (blocked) throw new ForbiddenException('Conversation indisponible.');

    // Cherche une conversation 1-à-1 existante entre les deux (pas un groupe).
    const existing = await this.prisma.conversationParticipant.findFirst({
      where: {
        userId: userAId,
        conversation: { isGroup: false, participants: { some: { userId: userBId } } },
      },
      select: { conversationId: true },
    });
    if (existing) return { id: existing.conversationId };

    const conv = await this.prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: userAId }, { userId: userBId }],
        },
      },
    });
    return { id: conv.id };
  }

  /** Crée un groupe de discussion. */
  async createGroup(creatorId: string, userIds: string[], title: string) {
    const others = [...new Set(userIds.filter((id) => id !== creatorId))];
    if (others.length < 2) throw new BadRequestException('Un groupe nécessite au moins 3 participants.');
    if (!title?.trim()) throw new BadRequestException('Nom du groupe requis.');
    const conv = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        title: title.trim(),
        creatorId,
        participants: {
          create: [creatorId, ...others].map((userId) => ({ userId })),
        },
      },
    });
    return { id: conv.id };
  }

  /** Ajoute des participants à un groupe (créateur uniquement). */
  async addParticipants(conversationId: string, userId: string, newUserIds: string[]) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true, creatorId: true },
    });
    if (!conv?.isGroup) throw new NotFoundException('Groupe introuvable');
    if (conv.creatorId !== userId) throw new ForbiddenException('Seul le créateur peut ajouter des membres.');
    await this.prisma.conversationParticipant.createMany({
      data: newUserIds.map((uid) => ({ conversationId, userId: uid })),
      skipDuplicates: true,
    });
    return { ok: true };
  }

  /** Quitte un groupe. */
  async leaveGroup(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId }, select: { isGroup: true } });
    if (!conv?.isGroup) throw new BadRequestException('Cette conversation n\'est pas un groupe.');
    await this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } });
    return { ok: true };
  }

  async listConversations(userId: string) {
    const participations = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: { where: { userId: { not: userId } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const otherUserIds = participations.flatMap((p) =>
      p.conversation.participants.map((pp) => pp.userId),
    );
    const uniqueIds = [...new Set(otherUserIds)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, displayName: true, photoUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return participations.map((p) => {
      const conv = p.conversation;
      const otherId = conv.participants[0]?.userId;
      return {
        id: conv.id,
        isGroup: conv.isGroup,
        title: conv.title,
        photoUrl: conv.photoUrl,
        participantsCount: conv.participants.length + 1,
        participants: conv.isGroup
          ? conv.participants.map((pp) => userMap[pp.userId] ?? { id: pp.userId, displayName: '?', photoUrl: null })
          : undefined,
        lastMessage: conv.messages[0] ?? null,
        otherUser: !conv.isGroup && otherId ? (userMap[otherId] ?? null) : null,
        lastReadAt: p.lastReadAt,
        updatedAt: conv.updatedAt,
      };
    });
  }

  async getMessages(conversationId: string, userId: string, before?: string, limit = 50) {
    await this.assertParticipant(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Marque comme lu
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    return this.hydrateMessages(messages.reverse(), userId);
  }

  async getNewMessages(conversationId: string, userId: string, after: string) {
    await this.assertParticipant(conversationId, userId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, createdAt: { gt: new Date(after) } },
      orderBy: { createdAt: 'asc' },
    });
    return this.hydrateMessages(messages, userId);
  }

  async sendMessage(conversationId: string, senderId: string, opts: SendMessageOptions) {
    await this.assertParticipant(conversationId, senderId);
    if (opts.replyToId) {
      const target = await this.prisma.message.findUnique({ where: { id: opts.replyToId }, select: { conversationId: true } });
      if (!target || target.conversationId !== conversationId) throw new NotFoundException('Message cité introuvable');
    }

    const [message] = await Promise.all([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content: opts.content,
          type: opts.type ?? 'text',
          mediaUrl: opts.mediaUrl,
          placeId: opts.placeId,
          postId: opts.postId,
          storyId: opts.storyId,
          replyToId: opts.replyToId,
          durationSec: opts.durationSec,
          oneTime: opts.oneTime ?? false,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    const [hydrated] = await this.hydrateMessages([message], senderId);
    return hydrated;
  }

  /** Réaction emoji sur un message (re-cliquer le même emoji la retire). */
  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
    if (!message) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(message.conversationId, userId);

    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });
    if (existing && existing.emoji === emoji) {
      await this.prisma.messageReaction.delete({ where: { messageId_userId: { messageId, userId } } });
    } else {
      await this.prisma.messageReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { emoji },
        create: { messageId, userId, emoji },
      });
    }
    const reactions = await this.prisma.messageReaction.findMany({ where: { messageId } });
    return { reactions };
  }

  /** Marque un média « vue unique » comme consommé. */
  async markOneTimeViewed(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, senderId: true, oneTime: true, viewedOnceAt: true },
    });
    if (!message) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(message.conversationId, userId);
    if (!message.oneTime || message.senderId === userId) return { ok: true };
    if (!message.viewedOnceAt) {
      await this.prisma.message.update({ where: { id: messageId }, data: { viewedOnceAt: new Date() } });
    }
    return { ok: true };
  }

  /** Enrichit les messages : réactions, message cité, post partagé, masquage vue unique consommée. */
  private async hydrateMessages(messages: Array<{ id: string; replyToId: string | null; postId: string | null; senderId: string; oneTime: boolean; viewedOnceAt: Date | null; mediaUrl: string | null; [k: string]: unknown }>, viewerId: string) {
    if (!messages.length) return [];
    const ids = messages.map((m) => m.id);
    const replyIds = [...new Set(messages.map((m) => m.replyToId).filter(Boolean))] as string[];
    const postIds = [...new Set(messages.map((m) => m.postId).filter(Boolean))] as string[];

    const [reactions, quoted, posts] = await Promise.all([
      this.prisma.messageReaction.findMany({ where: { messageId: { in: ids } } }),
      replyIds.length
        ? this.prisma.message.findMany({
            where: { id: { in: replyIds } },
            select: { id: true, content: true, senderId: true, type: true },
          })
        : Promise.resolve([]),
      postIds.length
        ? this.prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, mediaUrls: true, caption: true, userId: true },
          })
        : Promise.resolve([]),
    ]);

    const reactionsByMsg = new Map<string, typeof reactions>();
    for (const r of reactions) {
      if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, []);
      reactionsByMsg.get(r.messageId)!.push(r);
    }
    const quotedMap = Object.fromEntries(quoted.map((q) => [q.id, q]));
    const postMap = Object.fromEntries(posts.map((p) => [p.id, p]));

    return messages.map((m) => {
      // Vue unique déjà consommée → on masque le média pour le destinataire.
      const hideMedia = m.oneTime && m.viewedOnceAt !== null && m.senderId !== viewerId;
      return {
        ...m,
        mediaUrl: hideMedia ? null : m.mediaUrl,
        oneTimeConsumed: m.oneTime ? m.viewedOnceAt !== null : undefined,
        reactions: reactionsByMsg.get(m.id) ?? [],
        replyTo: m.replyToId ? (quotedMap[m.replyToId] ?? null) : null,
        sharedPost: m.postId ? (postMap[m.postId] ?? null) : null,
      };
    });
  }

  private async assertParticipant(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!p) throw new ForbiddenException('Accès refusé à cette conversation');
  }
}
