import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
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

  /** Envoie une notification push à un utilisateur via l'API Expo. */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) return;
    if (!user.expoPushToken.startsWith('ExponentPushToken[')) return;

    await this.send([{ to: user.expoPushToken, title, body, data, sound: 'default' }]);
  }

  /** Envoie des notifications en batch (max 100 par appel Expo). */
  async sendBatch(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += 100) {
      await this.send(messages.slice(i, i + 100));
    }
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
