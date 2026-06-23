import { Test } from '@nestjs/testing';
import { DailyDigestCronService } from '../daily-digest-cron.service';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factories ────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<any> = {}): any => ({
  id: 'user-1',
  expoPushToken: 'ExponentPushToken[valid]',
  locale: 'fr',
  preferences: { notifDigest: true },
  ...overrides,
});

const makePrisma = () => ({
  user: { findMany: jest.fn() },
});

const makeNotifications = () => ({
  sendBatch: jest.fn().mockResolvedValue(undefined),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DailyDigestCronService', () => {
  let service: DailyDigestCronService;
  let prisma: ReturnType<typeof makePrisma>;
  let notifications: ReturnType<typeof makeNotifications>;

  beforeEach(async () => {
    prisma = makePrisma();
    notifications = makeNotifications();

    const module = await Test.createTestingModule({
      providers: [
        DailyDigestCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(DailyDigestCronService);
  });

  afterEach(() => jest.clearAllMocks());

  it('envoie le digest aux utilisateurs éligibles', async () => {
    prisma.user.findMany.mockResolvedValue([makeUser()]);

    await service.sendDailyDigest();

    expect(notifications.sendBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          to: 'ExponentPushToken[valid]',
          data: expect.objectContaining({ type: 'daily_digest' }),
          sound: 'default',
        }),
      ]),
    );
  });

  it('ne fait rien si aucun utilisateur éligible', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.sendDailyDigest();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('exclut les utilisateurs qui ont désactivé le digest', async () => {
    prisma.user.findMany.mockResolvedValue([
      makeUser({ preferences: { notifDigest: false } }),
    ]);

    await service.sendDailyDigest();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('exclut les tokens push invalides', async () => {
    prisma.user.findMany.mockResolvedValue([
      makeUser({ expoPushToken: 'not-an-expo-token' }),
    ]);

    await service.sendDailyDigest();

    expect(notifications.sendBatch).not.toHaveBeenCalled();
  });

  it('traite les utilisateurs en lots de 100', async () => {
    const users = Array.from({ length: 250 }, (_, i) =>
      makeUser({ id: `user-${i}`, expoPushToken: `ExponentPushToken[token-${i}]` }),
    );
    prisma.user.findMany.mockResolvedValue(users);

    await service.sendDailyDigest();

    // 250 utilisateurs → 3 lots (100 + 100 + 50)
    expect(notifications.sendBatch).toHaveBeenCalledTimes(3);
  });

  it('opt-in par défaut quand notifDigest est absent des préférences', async () => {
    prisma.user.findMany.mockResolvedValue([
      makeUser({ preferences: {} }), // pas de clé notifDigest
    ]);

    await service.sendDailyDigest();

    expect(notifications.sendBatch).toHaveBeenCalledTimes(1);
  });
});
