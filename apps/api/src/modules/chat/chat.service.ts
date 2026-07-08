import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(userAId: string, userBId: string) {
    // Cherche une conversation existante entre les deux
    const existing = await this.prisma.conversationParticipant.findFirst({
      where: { userId: userAId, conversation: { participants: { some: { userId: userBId } } } },
      select: { conversationId: true },
    });
    if (existing) return { id: existing.conversationId };

    // Crée une nouvelle
    const conv = await this.prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: userAId }, { userId: userBId }],
        },
      },
    });
    return { id: conv.id };
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
      const otherId = p.conversation.participants[0]?.userId;
      return {
        id: p.conversation.id,
        lastMessage: p.conversation.messages[0] ?? null,
        otherUser: otherId ? (userMap[otherId] ?? null) : null,
        lastReadAt: p.lastReadAt,
        updatedAt: p.conversation.updatedAt,
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

    return messages.reverse();
  }

  async getNewMessages(conversationId: string, userId: string, after: string) {
    await this.assertParticipant(conversationId, userId);
    return this.prisma.message.findMany({
      where: { conversationId, createdAt: { gt: new Date(after) } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: 'text' | 'image' | 'place_share' | 'location_share' = 'text',
    mediaUrl?: string,
    placeId?: string,
  ) {
    await this.assertParticipant(conversationId, senderId);

    const [message] = await Promise.all([
      this.prisma.message.create({
        data: { conversationId, senderId, content, type, mediaUrl, placeId },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  private async assertParticipant(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!p) throw new ForbiddenException('Accès refusé à cette conversation');
  }
}
