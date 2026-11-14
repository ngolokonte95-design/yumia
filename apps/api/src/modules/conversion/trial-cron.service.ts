import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PLAN_PRICE_EUR, TRIAL_REMINDER_DAYS, trialDaysLeft } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY_MS = 86_400_000;

type Lang = 'fr' | 'en';

/** Textes des notifications d'essai. Français pour les comptes en français, anglais sinon. */
export function trialMessage(kind: 'reminder' | 'ended', lang: Lang, daysLeft = 0): { title: string; body: string } {
  const price = lang === 'fr'
    ? `${PLAN_PRICE_EUR.gold.toFixed(2).replace('.', ',')} €`
    : `€${PLAN_PRICE_EUR.gold.toFixed(2)}`;
  if (kind === 'ended') {
    return lang === 'fr'
      ? { title: '👑 Ton essai Gold est terminé', body: `Ton compte est repassé en version gratuite. Retrouve les limites Gold pour ${price} par mois.` }
      : { title: '👑 Your Gold trial has ended', body: `Your account is back on the free version. Get Gold's limits back for ${price} a month.` };
  }
  if (daysLeft <= 1) {
    return lang === 'fr'
      ? { title: '👑 Dernier jour de Gold offert', body: `Demain, ton compte repasse en version gratuite. Garde Gold pour ${price} par mois.` }
      : { title: '👑 Last day of free Gold', body: `Tomorrow your account goes back to the free version. Keep Gold for ${price} a month.` };
  }
  return lang === 'fr'
    ? { title: `👑 Plus que ${daysLeft} jours de Gold offert`, body: `Ensuite, ton compte repasse en version gratuite. Garde Gold pour ${price} par mois.` }
    : { title: `👑 ${daysLeft} days of free Gold left`, body: `Then your account goes back to the free version. Keep Gold for ${price} a month.` };
}

/**
 * Fin de l'essai Gold offert à l'inscription :
 * - un rappel par jour pendant les {@link TRIAL_REMINDER_DAYS} derniers jours,
 *   avec l'offre Gold ;
 * - un message quand l'essai se termine.
 * Chaque notification ouvre la page des forfaits, et s'inscrit aussi dans le
 * centre de notifications (utile sans permission push).
 */
@Injectable()
export class TrialCronService {
  private readonly logger = new Logger(TrialCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 17:00 UTC : fin d'après-midi en Europe, moment où l'on prépare sa soirée. */
  @Cron('0 17 * * *', { name: 'trial-reminders', timeZone: 'UTC' })
  async sendReminders(now = new Date()): Promise<void> {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const users = await this.prisma.user.findMany({
      where: {
        plan: 'free',
        trialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * DAY_MS) },
        OR: [{ trialRemindedAt: null }, { trialRemindedAt: { lt: dayStart } }],
      },
      select: { id: true, locale: true, trialEndsAt: true },
    });
    for (const u of users) {
      const { title, body } = trialMessage('reminder', langOf(u.locale), trialDaysLeft(u.trialEndsAt, now.getTime()));
      await this.notifications.sendToUser(u.id, title, body, { type: 'trial_reminder', path: '/plus' });
      await this.prisma.user.update({ where: { id: u.id }, data: { trialRemindedAt: now } });
    }
    if (users.length) this.logger.log(`Essai Gold : ${users.length} rappel(s) envoyé(s)`);
  }

  /** Toutes les heures : l'essai vient de finir. Au-delà d'une semaine, on ne prévient plus. */
  @Cron('5 * * * *', { name: 'trial-ended', timeZone: 'UTC' })
  async sendEnded(now = new Date()): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        plan: 'free',
        trialEndNotifiedAt: null,
        trialEndsAt: { lte: now, gt: new Date(now.getTime() - 7 * DAY_MS) },
      },
      select: { id: true, locale: true },
    });
    for (const u of users) {
      const { title, body } = trialMessage('ended', langOf(u.locale));
      await this.notifications.sendToUser(u.id, title, body, { type: 'trial_ended', path: '/plus' });
      await this.prisma.user.update({ where: { id: u.id }, data: { trialEndNotifiedAt: now } });
    }
    if (users.length) this.logger.log(`Essai Gold : ${users.length} fin(s) d'essai notifiée(s)`);
  }
}

function langOf(locale: string | null | undefined): Lang {
  return (locale ?? 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
