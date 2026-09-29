import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from '../orders.service';

function makeService(order: { id: string; status: string } | null) {
  const prisma = {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const service = Object.create(OrdersService.prototype) as OrdersService;
  (service as unknown as { prisma: typeof prisma }).prisma = prisma;
  return { service, prisma };
}

describe('OrdersService.hideOrder — retirer une commande de « Mes commandes »', () => {
  it.each(['delivered', 'cancelled', 'refunded'])('commande %s : masquée, jamais effacée', async (status) => {
    const { service, prisma } = makeService({ id: 'o1', status });
    await expect(service.hideOrder('u1', 'o1')).resolves.toEqual({ ok: true });
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { hiddenByUserAt: expect.any(Date) } });
  });

  it.each(['paid', 'fulfilling', 'shipped'])('commande %s (en cours) : refusée', async (status) => {
    const { service, prisma } = makeService({ id: 'o1', status });
    await expect(service.hideOrder('u1', 'o1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("commande d'un autre compte : introuvable", async () => {
    const { service, prisma } = makeService(null);
    await expect(service.hideOrder('u2', 'o1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', userId: 'u2' } }));
  });
});
