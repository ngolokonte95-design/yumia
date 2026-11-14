import { effectivePlan, isOnTrial, trialDaysLeft, trialEndFrom } from '@yumia/shared';
import { TrialCronService, trialMessage } from '../trial-cron.service';

const DAY = 86_400_000;

describe('essai Gold', () => {
  const now = Date.UTC(2026, 10, 14, 17);

  it('donne Gold pendant 7 jours à un compte gratuit, puis Gratuit', () => {
    const end = trialEndFrom(new Date(now));
    expect(end.getTime() - now).toBe(7 * DAY);
    expect(effectivePlan('free', end, now)).toBe('gold');
    expect(effectivePlan('free', end, end.getTime() + 1)).toBe('free');
    expect(effectivePlan('free', null, now)).toBe('free');
  });

  it("ne touche jamais au forfait d'un abonné", () => {
    const end = trialEndFrom(new Date(now));
    expect(effectivePlan('diamond', end, now)).toBe('diamond');
    expect(isOnTrial('gold', end, now)).toBe(false);
  });

  it('compte les jours restants au jour supérieur', () => {
    expect(trialDaysLeft(new Date(now + 2.5 * DAY), now)).toBe(3);
    expect(trialDaysLeft(new Date(now + 1), now)).toBe(1);
    expect(trialDaysLeft(new Date(now - 1), now)).toBe(0);
  });

  it('rédige les rappels en français ou en anglais', () => {
    expect(trialMessage('reminder', 'fr', 3).title).toContain('3 jours');
    expect(trialMessage('reminder', 'fr', 1).title).toContain('Dernier jour');
    expect(trialMessage('reminder', 'fr', 2).body).toContain('4,99 €');
    expect(trialMessage('ended', 'en').body).toContain('€4.99');
  });
});

describe('TrialCronService', () => {
  const now = new Date(Date.UTC(2026, 10, 14, 17));
  const make = () => {
    const prisma = { user: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    const notifications = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    return { prisma, notifications, cron: new TrialCronService(prisma as never, notifications as never) };
  };

  it('envoie un rappel par jour pendant les 3 derniers jours, vers les forfaits', async () => {
    const { prisma, notifications, cron } = make();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', locale: 'fr', trialEndsAt: new Date(now.getTime() + 2 * DAY) },
    ]);
    await cron.sendReminders(now);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.plan).toBe('free');
    expect(where.trialEndsAt.lte.getTime()).toBe(now.getTime() + 3 * DAY);
    expect(notifications.sendToUser).toHaveBeenCalledWith(
      'u1', expect.stringContaining('2 jours'), expect.any(String), { type: 'trial_reminder', path: '/plus' },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { trialRemindedAt: now } });
  });

  it("prévient une seule fois à la fin de l'essai", async () => {
    const { prisma, notifications, cron } = make();
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', locale: 'en-US' }]);
    await cron.sendEnded(now);

    expect(prisma.user.findMany.mock.calls[0][0].where.trialEndNotifiedAt).toBeNull();
    expect(notifications.sendToUser).toHaveBeenCalledWith(
      'u2', '👑 Your Gold trial has ended', expect.any(String), { type: 'trial_ended', path: '/plus' },
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { trialEndNotifiedAt: now } });
  });
});
