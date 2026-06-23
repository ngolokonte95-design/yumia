import { Test } from '@nestjs/testing';
import { AuthCleanupCron } from '../auth-cleanup.cron';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makePrisma = () => ({
  refreshToken: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  passwordResetToken: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthCleanupCron', () => {
  let cron: AuthCleanupCron;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module = await Test.createTestingModule({
      providers: [
        AuthCleanupCron,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    cron = module.get(AuthCleanupCron);
  });

  afterEach(() => jest.clearAllMocks());

  it('supprime les refresh tokens expirés et révoqués', async () => {
    await cron.cleanupExpiredTokens();

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { revokedAt: { not: null } },
        ],
      },
    });
  });

  it('supprime les tokens de réinitialisation expirés et utilisés', async () => {
    await cron.cleanupExpiredTokens();

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { usedAt: { not: null } },
        ],
      },
    });
  });

  it('exécute les deux suppressions en parallèle (un seul await)', async () => {
    let resolveRefresh!: () => void;
    let resolveReset!: () => void;
    const order: string[] = [];

    prisma.refreshToken.deleteMany.mockImplementation(
      () =>
        new Promise<{ count: number }>((res) => {
          resolveRefresh = () => { order.push('refresh'); res({ count: 2 }); };
        }),
    );
    prisma.passwordResetToken.deleteMany.mockImplementation(
      () =>
        new Promise<{ count: number }>((res) => {
          resolveReset = () => { order.push('reset'); res({ count: 3 }); };
        }),
    );

    const promise = cron.cleanupExpiredTokens();
    // Résoudre dans l'ordre inverse pour prouver qu'ils tournent en parallèle
    resolveReset();
    resolveRefresh();
    await promise;

    expect(order).toEqual(['reset', 'refresh']);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('ne lève pas d\'erreur quand aucun token n\'est supprimé', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(cron.cleanupExpiredTokens()).resolves.toBeUndefined();
  });

  it('retourne correctement quand des tokens sont supprimés', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 3 });

    await expect(cron.cleanupExpiredTokens()).resolves.toBeUndefined();
  });
});
