import { Test } from '@nestjs/testing';
import { GroupsCleanupCron } from '../groups-cleanup.cron';
import { PrismaService } from '../../../infra/prisma/prisma.service';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makePrisma = () => ({
  groupSession: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GroupsCleanupCron', () => {
  let cron: GroupsCleanupCron;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();

    const module = await Test.createTestingModule({
      providers: [
        GroupsCleanupCron,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    cron = module.get(GroupsCleanupCron);
  });

  afterEach(() => jest.clearAllMocks());

  it('supprime les sessions "waiting" plus anciennes que 24h', async () => {
    const before = Date.now();
    await cron.cleanupStaleSessions();
    const after = Date.now();

    const calls = (prisma.groupSession.deleteMany as jest.Mock).mock.calls;
    const waitingCall = calls.find((c: unknown[]) => {
      const where = (c[0] as { where: { status: string } }).where;
      return where.status === 'waiting';
    });

    expect(waitingCall).toBeDefined();
    const threshold = (waitingCall[0] as { where: { createdAt: { lt: Date } } }).where.createdAt.lt.getTime();
    const expectedMinThreshold = before - 24 * 60 * 60 * 1000;
    const expectedMaxThreshold = after - 24 * 60 * 60 * 1000;
    expect(threshold).toBeGreaterThanOrEqual(expectedMinThreshold);
    expect(threshold).toBeLessThanOrEqual(expectedMaxThreshold);
  });

  it('supprime les sessions "voting" plus anciennes que 48h', async () => {
    const before = Date.now();
    await cron.cleanupStaleSessions();
    const after = Date.now();

    const calls = (prisma.groupSession.deleteMany as jest.Mock).mock.calls;
    const votingCall = calls.find((c: unknown[]) => {
      const where = (c[0] as { where: { status: string } }).where;
      return where.status === 'voting';
    });

    expect(votingCall).toBeDefined();
    const threshold = (votingCall[0] as { where: { createdAt: { lt: Date } } }).where.createdAt.lt.getTime();
    const expectedMinThreshold = before - 48 * 60 * 60 * 1000;
    const expectedMaxThreshold = after - 48 * 60 * 60 * 1000;
    expect(threshold).toBeGreaterThanOrEqual(expectedMinThreshold);
    expect(threshold).toBeLessThanOrEqual(expectedMaxThreshold);
  });

  it('appelle deleteMany deux fois (waiting + voting) en parallèle', async () => {
    await cron.cleanupStaleSessions();

    expect(prisma.groupSession.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('ne lève pas d\'erreur quand aucune session n\'est supprimée', async () => {
    prisma.groupSession.deleteMany.mockResolvedValue({ count: 0 });

    await expect(cron.cleanupStaleSessions()).resolves.toBeUndefined();
  });

  it('retourne correctement quand des sessions sont supprimées', async () => {
    prisma.groupSession.deleteMany
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(cron.cleanupStaleSessions()).resolves.toBeUndefined();
  });
});
