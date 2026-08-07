import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  /**
   * Propriétaire de la notification — sert uniquement à la persistance côté
   * serveur (voir `sendBatch`), jamais envoyé à Expo. Absent pour un envoi
   * hors `sendToUser`/`sendBatch` (aucune ligne persistée dans ce cas).
   */
  userId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Enregistre ou met à jour le push token Expo d'un utilisateur. */
  async registerToken(userId: string, token: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });
  }

  /**
   * Envoie une notification push à un utilisateur via l'API Expo, et persiste
   * toujours une ligne côté serveur — même si l'utilisateur n'a pas de push
   * token ou que l'envoi échoue. C'est ce qui alimente le centre de
   * notifications (`list`/`unreadCount` ci-dessous) : avant, un push manqué
   * hors-ligne était perdu pour de bon, rien n'en gardait la trace.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.persist(userId, title, body, data);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) return;
    if (!user.expoPushToken.startsWith('ExponentPushToken[')) return;

    await this.send([{ to: user.expoPushToken, title, body, data, sound: 'default' }]);
  }

  /**
   * Envoie des notifications en batch (max 100 par appel Expo), et persiste
   * une ligne par destinataire — nécessite `userId` sur chaque message (les
   * crons l'ont déjà en base au moment de construire le batch).
   */
  async sendBatch(messages: ExpoPushMessage[]): Promise<void> {
    await Promise.all(
      messages
        .filter((m) => m.userId)
        .map((m) => this.persist(m.userId!, m.title, m.body, m.data)),
    );

    // `userId` ne fait pas partie du contrat Expo — on ne l'envoie pas.
    const expoMessages = messages.map(({ userId: _userId, ...rest }) => rest);
    for (let i = 0; i < expoMessages.length; i += 100) {
      await this.send(expoMessages.slice(i, i + 100));
    }
  }

  private async persist(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const type = typeof data?.type === 'string' ? data.type : 'generic';
    try {
      await this.prisma.notification.create({
        data: { userId, type, title, body, data: data as Prisma.InputJsonValue },
      });
    } catch (err) {
      // Une notification non persistée reste tout de même envoyée en push —
      // ne jamais bloquer l'envoi pour un souci d'écriture du centre de notifs.
      this.logger.error('Échec de persistance de la notification', err);
    }
  }

  /** Liste paginée (curseur), les plus récentes d'abord. */
  async list(userId: string, opts: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 30));
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  /** No-op silencieux si `id` n'appartient pas à `userId` (pas d'erreur à faire remonter). */
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  }

  private async send(messages: ExpoPushMessage[]): Promise<void> {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        this.logger.warn(`Expo push HTTP ${res.status}`);
        return;
      }

      const json = (await res.json()) as { data: ExpoPushTicket[] };
      const staleTokens: string[] = [];

      (json.data ?? []).forEach((ticket, i) => {
        if (ticket.status === 'error') {
          this.logger.warn(`Expo push error: ${ticket.message ?? ticket.details?.error}`);
          if (ticket.details?.error === 'DeviceNotRegistered' && messages[i]) {
            staleTokens.push(messages[i].to);
          }
        }
      });

      if (staleTokens.length > 0) {
        await this.prisma.user.updateMany({
          where: { expoPushToken: { in: staleTokens } },
          data: { expoPushToken: null },
        });
        this.logger.log(`${staleTokens.length} token(s) push invalide(s) supprimés`);
      }
    } catch (err) {
      this.logger.error('Expo push failed', err);
    }
  }
}
