import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ModerationService } from '../moderation.service';

function makeService(email: string | null) {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => (email ? { email } : null)),
      update: jest.fn(async () => ({})),
    },
    refreshToken: { updateMany: jest.fn(async () => ({ count: 2 })) },
  };
  return { service: new ModerationService(prisma as never, {} as never), prisma };
}

describe('ModerationService.suspend', () => {
  const env = process.env.ADMIN_EMAILS;
  beforeEach(() => { process.env.ADMIN_EMAILS = 'admin@yumia.eu'; });
  afterAll(() => { process.env.ADMIN_EMAILS = env; });

  it('suspend pour la durée demandée et ferme les sessions ouvertes', async () => {
    const { service, prisma } = makeService('user@test.fr');
    const until = await service.suspend('u1', 7, 'Spam');
    expect(until.getTime() - Date.now()).toBeGreaterThan(6 * 86400000);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ suspendedReason: 'Spam' }),
    }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', revokedAt: null },
    }));
  });

  it('sans durée, bannit (date lointaine)', async () => {
    const { service } = makeService('user@test.fr');
    const until = await service.suspend('u1');
    expect(until.getFullYear()).toBeGreaterThan(new Date().getFullYear() + 50);
  });

  it('refuse de suspendre un administrateur', async () => {
    const { service, prisma } = makeService('Admin@yumia.eu');
    await expect(service.suspend('u1', 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('signale un compte introuvable', async () => {
    const { service } = makeService(null);
    await expect(service.suspend('absent', 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});
