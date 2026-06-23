/**
 * Digest quotidien à 18h30 UTC.
 * Envoie une notification push aux utilisateurs actifs qui ont activé le digest
 * (opt-in par défaut). Le contenu est volontairement simple pour ne pas coûter
 * d'appels IA par utilisateur — le vrai contenu personnalisé est généré à
 * l'ouverture de l'app par les moteurs de recommandation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

const DIGEST_MESSAGES_FR = [
  { title: "🌅 C'est l'heure de l'aventure !", body: "YUMIA a sélectionné 3 lieux pour toi ce soir. Ouvre l'app !" },
  { title: "🔥 Ce soir, explore !",             body: "Ton copilote IA t'attend avec de nouvelles idées. À tout de suite !" },
  { title: "✨ Bonne soirée !",                 body: "Pas d'idée pour ce soir ? YUMIA a trouvé les meilleures adresses près de toi." },
  { title: "🗺️ Sors ce soir !",                body: "Ton passeport ne se remplit pas tout seul 😉 YUMIA t'a préparé ta sélection." },
  { title: "🎯 Prêt(e) pour ce soir ?",        body: "3 lieux incontournables t'attendent dans YUMIA. Ouvre l'app !" },
];

@Injectable()
export class DailyDigestCronService {
  private readonly logger = new Logger(DailyDigestCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Tous les jours à 18h30 UTC. */
  @Cron('30 18 * * *', { name: 'daily-digest', timeZone: 'UTC' })
  async sendDailyDigest(): Promise<void> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Utilisateurs actifs dans les 30 derniers jours avec un push token valide
    const users = await this.prisma.user.findMany({
      where: {
        expoPushToken: { not: null },
        visits: { some: { visitedAt: { gte: since } } },
      },
      select: { id: true, expoPushToken: true, locale: true, preferences: true },
    });

    const eligible = users.filter((u) => {
      const prefs = u.preferences as { notifDigest?: boolean } | null;
      return prefs?.notifDigest !== false && u.expoPushToken?.startsWith('ExponentPushToken[');
    });

    if (eligible.length === 0) {
      this.logger.log('Daily digest : aucun destinataire éligible.');
      return;
    }

    this.logger.log(`Daily digest : envoi à ${eligible.length} utilisateur(s).`);

    // Sélection du message du jour (rotation par index de jour de l'année)
    const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
    const { title, body } = DIGEST_MESSAGES_FR[dayOfYear % DIGEST_MESSAGES_FR.length];

    const BATCH = 100;
    for (let i = 0; i < eligible.length; i += BATCH) {
      const batch = eligible.slice(i, i + BATCH);
      const messages = batch.map((u) => ({
        to: u.expoPushToken!,
        title,
        body,
        sound: 'default' as const,
        data: { type: 'daily_digest' },
      }));
      await this.notifications.sendBatch(messages);
    }

    this.logger.log(`Daily digest : ${eligible.length} notification(s) envoyée(s).`);
  }
}
