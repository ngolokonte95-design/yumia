import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class StreakCronService {
  private readonly logger = new Logger(StreakCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Tous les jours à 23:00 UTC — trouve les utilisateurs avec une streak active
   * qui n'ont pas encore visité aujourd'hui, et leur envoie un rappel.
   */
  @Cron('0 23 * * *', { timeZone: 'UTC' })
  async warnStreakDanger(): Promise<void> {
    const todayUtc = new Date();
    const dayStart = new Date(
      Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()),
    );

    // Utilisateurs avec streak > 0 dont la lastActivityDay n'est PAS aujourd'hui
    const atRisk = await this.prisma.streak.findMany({
      where: {
        current: { gt: 0 },
        lastActivityDay: { lt: dayStart },
      },
      select: {
        userId: true,
        current: true,
        user: { select: { expoPushToken: true, preferences: true } },
      },
    });

    this.logger.log(`Streak danger : ${atRisk.length} utilisateur(s) à risque`);

    const messages = atRisk
      .filter((s) => {
        if (!s.user.expoPushToken?.startsWith('ExponentPushToken[')) return false;
        const prefs = s.user.preferences as { notifStreak?: boolean } | null;
        return prefs?.notifStreak !== false; // opt-in par défaut
      })
      .map((s) => ({
        to: s.user.expoPushToken!,
        title: `🔥 Ta série de ${s.current} jour${s.current > 1 ? 's' : ''} est en danger !`,
        body: 'Il te reste 1 heure pour visiter un lieu et garder ta flamme.',
        sound: 'default' as const,
        data: { type: 'streak_danger', current: s.current },
      }));

    if (messages.length > 0) {
      await this.notifications.sendBatch(messages);
    }
  }
}
