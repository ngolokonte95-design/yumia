/**
 * Cron "lieu sauvegardé qui ferme bientôt".
 * Toutes les heures entre 17h et 22h UTC, trouve les utilisateurs ayant sauvegardé
 * un lieu qui ferme dans moins de 2 heures ce soir — et leur envoie une notif push.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class SavedPlacesCronService {
  private readonly logger = new Logger(SavedPlacesCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Toutes les heures de 17h à 22h UTC. */
  @Cron('0 17-22 * * *', { timeZone: 'UTC' })
  async notifyClosingSoon(): Promise<void> {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    // Heure courante en minutes depuis minuit
    const nowMinutes = currentHour * 60 + currentMinute;
    // On cherche les lieux qui ferment dans 60-120 minutes
    const targetMin = nowMinutes + 60;
    const targetMax = nowMinutes + 120;

    // Récupère les SavedPlaces dont le lieu a des openingHours en metadata
    const saved = await this.prisma.savedPlace.findMany({
      where: {
        user: { expoPushToken: { not: null } },
      },
      include: {
        user: { select: { id: true, expoPushToken: true, preferences: true } },
        place: { select: { id: true, name: true, metadata: true } },
      },
      take: 2000,
    });

    const todayIdx = (now.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
    const toSend: { token: string; placeName: string; closingTime: string }[] = [];

    for (const s of saved) {
      if (!s.user.expoPushToken?.startsWith('ExponentPushToken[')) continue;
      const prefs = s.user.preferences as { notifSavedPlaces?: boolean } | null;
      if (prefs?.notifSavedPlaces === false) continue;

      const raw = s.place.metadata;
      const meta = (typeof raw === 'string'
        ? (JSON.parse(raw) as { openingHours?: string[] })
        : (raw as { openingHours?: string[] } | null));
      const hours = meta?.openingHours;
      if (!hours || hours.length === 0) continue;

      const entry = hours[todayIdx];
      if (!entry) continue;
      const colonIdx = entry.indexOf(': ');
      const timeRange = colonIdx >= 0 ? entry.slice(colonIdx + 2) : entry;
      if (timeRange.toLowerCase().includes('fermé') || timeRange.toLowerCase().includes('closed')) continue;

      const parts = timeRange.split(/\s[–\-]\s/);
      if (parts.length < 2) continue;
      const closingStr = parts[parts.length - 1].trim();
      const closingMinutes = parseTimeToMinutes(closingStr);
      if (closingMinutes == null) continue;

      if (closingMinutes >= targetMin && closingMinutes <= targetMax) {
        const h = Math.floor(closingMinutes / 60);
        const m = closingMinutes % 60;
        const closingTime = `${String(h).padStart(2, '0')}h${m === 0 ? '00' : String(m).padStart(2, '0')}`;
        toSend.push({ token: s.user.expoPushToken, placeName: s.place.name, closingTime });
      }
    }

    this.logger.log(`Saved places closing: ${toSend.length} notification(s) à envoyer`);
    if (toSend.length === 0) return;

    await this.notifications.sendBatch(
      toSend.map(({ token, placeName, closingTime }) => ({
        to: token,
        title: `⏰ ${placeName} ferme à ${closingTime}`,
        body: "C'est le bon moment pour y aller avant la fermeture !",
        sound: 'default' as const,
        data: { type: 'closing_soon' },
      })),
    );
  }
}

function parseTimeToMinutes(time: string): number | null {
  // Formats : "22:30", "10:30 PM", "10:30 AM"
  const pm = time.match(/^(\d{1,2}):(\d{2})\s*PM$/i);
  if (pm) {
    const h = parseInt(pm[1], 10);
    return (h === 12 ? 12 : h + 12) * 60 + parseInt(pm[2], 10);
  }
  const am = time.match(/^(\d{1,2}):(\d{2})\s*AM$/i);
  if (am) {
    const h = parseInt(am[1], 10);
    return (h === 12 ? 0 : h) * 60 + parseInt(am[2], 10);
  }
  const plain = time.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10);
  return null;
}
