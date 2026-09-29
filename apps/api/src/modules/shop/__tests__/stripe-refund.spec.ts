import { OrdersService } from '../orders.service';

function makeService(charge: Record<string, unknown>, piMetadata: Record<string, string> = {}) {
  const prisma = { order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const stripe = {
    webhooks: { constructEvent: jest.fn().mockReturnValue({ type: 'charge.refunded', data: { object: charge } }) },
    paymentIntents: { retrieve: jest.fn().mockResolvedValue({ metadata: piMetadata }) },
  };
  const service = Object.create(OrdersService.prototype) as OrdersService;
  Object.assign(service, { prisma, stripeClient: stripe, logger: { log: jest.fn(), warn: jest.fn() } });
  return { service, prisma, stripe };
}

describe('Webhook Stripe — charge.refunded', () => {
  const OLD = process.env.STRIPE_WEBHOOK_SECRET;
  beforeAll(() => { process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; });
  afterAll(() => { process.env.STRIPE_WEBHOOK_SECRET = OLD; });

  it('remboursement total : la commande passe en « refunded »', async () => {
    const { service, prisma } = makeService({ id: 'ch_1', refunded: true, metadata: { orderId: 'o1' } });
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['paid', 'fulfilling', 'shipped', 'delivered'] } },
      data: { status: 'refunded' },
    });
  });

  it("orderId absent de la charge : lu sur le PaymentIntent", async () => {
    const { service, prisma, stripe } = makeService({ id: 'ch_2', refunded: true, metadata: {}, payment_intent: 'pi_9' }, { orderId: 'o2' });
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_9');
    expect(prisma.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'o2' }) }));
  });

  it('remboursement partiel : commande inchangée', async () => {
    const { service, prisma } = makeService({ id: 'ch_3', refunded: false, metadata: { orderId: 'o3' } });
    await service.handleStripeWebhook(Buffer.from('{}'), 'sig');
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
