import { Test } from '@nestjs/testing';
import { StreakCronService } from '../streak-cron.service';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factories ────────────────────────────────────────────────────────────

const makeStreak = (overrides: Partial<any> = {}): any => ({
  userId: 'user-1',
  current: 7,
  user: {
    expoPushToken: 'ExponentPushToken[valid]',
    preferences: { notifStreak: true },
  },
  ...overrides,
});

const makePrisma = () => ({
  streak: { findMany: jest.fn() },
});

const makeNotifications = () => ({
  sendBatch: jest.fn().mockResolvedValue(undefined),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StreakCronService', () => {
  let service: StreakCronService;
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: ReturnType<typeof makeNotifications>;

  beforeEach(async () => {
    prisma = makePrisma();
    notifications = makeNotifications();

    const module = await Test.createTestingModule({
      providers: [
        StreakCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(StreakCronService);
  });

  afterEach(() => jest.clearAllMocks());

  it('envoie des notifications aux utilisateurs avec streak en danger', async () => {
    prisma.streak.findMany.mockResolvedValue([makeStreak({ current: 5 })]);

    await service.warnStreakDanger();

    expect(notifications.sendBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'ExponentPushToken[valid]',
          data: expect.objectContaining({ type: 'streak_danger', current: 5 }),
        }),
      ]),
    );
  });

  it('ne fait rien si aucun utilisateur n\'est à risque', async () => {
    prisma.streak.findMany.mockResolvedValue([]);

    await service.warnStreakDanger();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('exclut les utilisateurs ayant désactivé les notifs de streak', async () => {
    prisma.streak.findMany.mockResolvedValue([
      makeStreak({ user: { expoPushToken: 'ExponentPushToken[valid]', preferences: { notifStreak: false } } }),
    ]);

    await service.warnStreakDanger();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('exclut les tokens push invalides (non Expo)', async () => {
    prisma.streak.findMany.mockResolvedValue([
      makeStreak({ user: { expoPushToken: 'invalid-token', preferences: {} } }),
    ]);

    await service.warnStreakDanger();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('exclut les utilisateurs sans token push', async () => {
    prisma.streak.findMany.mockResolvedValue([
      makeStreak({ user: { expoPushToken: null, preferences: {} } }),
    ]);

    await service.warnStreakDanger();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('envoie un message avec le bon pluriel pour une streak de 1 jour', async () => {
    prisma.streak.findMany.mockResolvedValue([makeStreak({ current: 1 })]);

    await service.warnStreakDanger();

    const call = (notifications.sendBatch as jest.Mock).mock.calls[0][0][0];
    expect(call.title).toContain('1 jour est en danger');
    expect(call.title).not.toContain('jours');
  });

  it('envoie un message au pluriel pour une streak > 1 jour', async () => {
    prisma.streak.findMany.mockResolvedValue([makeStreak({ current: 3 })]);

    await service.warnStreakDanger();

    const call = (notifications.sendBatch as jest.Mock).mock.calls[0][0][0];
    expect(call.title).toContain('3 jours');
  });
});
