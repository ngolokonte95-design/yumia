import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { QuotaService } from '../quota.service';

function makeService(plan: string | null, stored: Record<string, number> = {}) {
  const redisRaw = {
    get: jest.fn(async (k: string) => (k in stored ? String(stored[k]) : null)),
    incr: jest.fn(async (k: string) => (stored[k] = (stored[k] ?? 0) + 1)),
    expire: jest.fn(async () => 1),
  };
  const redis = { raw: redisRaw } as never;
  const prisma = {
    user: { findUnique: jest.fn(async () => (plan ? { plan } : null)) },
  } as never;
  return { service: new QuotaService(redis, prisma), redisRaw, stored };
}

const userReq = (body: unknown = {}) => ({ user: { sub: 'u1' }, body, ip: '1.2.3.4' }) as unknown as Request;
const anonReq = () => ({ ip: '1.2.3.4', socket: {} }) as unknown as Request;

describe('QuotaService', () => {
  it('laisse passer sous la limite du forfait, puis compte l\'appel', async () => {
    const { service, redisRaw } = makeService('free');
    const key = await service.assertAvailable({ name: 'chatbot', feature: 'chatbotPerDay' }, userReq());
    expect(key).toMatch(/^quota:chatbot:u:u1:\d{4}-\d{2}-\d{2}$/);
    await service.consume(key!);
    expect(redisRaw.incr).toHaveBeenCalledWith(key);
    expect(redisRaw.expire).toHaveBeenCalledTimes(1);
  });

  it('refuse en 429 une fois la limite du forfait Gratuit atteinte (10 messages)', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { service } = makeService('free', { [`quota:chatbot:u:u1:${day}`]: 10 });
    await expect(
      service.assertAvailable({ name: 'chatbot', feature: 'chatbotPerDay' }, userReq()),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('applique la limite du forfait réel : Gold va plus loin que Gratuit', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { service } = makeService('gold', { [`quota:chatbot:u:u1:${day}`]: 10 });
    await expect(
      service.assertAvailable({ name: 'chatbot', feature: 'chatbotPerDay' }, userReq()),
    ).resolves.toBeTruthy();
  });

  it('ajoute la marge des écrans que l\'app ne compte pas', async () => {
    const day = new Date().toISOString().slice(0, 10);
    // Gratuit : 5 lancers + 30 de marge = 35.
    const { service } = makeService('free', { [`quota:top3:u:u1:${day}`]: 34 });
    const rule = { name: 'top3', feature: 'surprisePerDay' as const, margin: 30 };
    await expect(service.assertAvailable(rule, userReq())).resolves.toBeTruthy();
  });

  it('sépare les compteurs par portée (un mode n\'entame pas l\'autre)', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { service } = makeService('free', { [`quota:itinerary:date:u:u1:${day}`]: 3 });
    const rule = { name: 'itinerary', feature: 'itineraryPerModePerDay' as const, scope: (r: Request) => r.body.mood };
    await expect(service.assertAvailable(rule, userReq({ mood: 'date' }))).rejects.toBeInstanceOf(HttpException);
    await expect(service.assertAvailable(rule, userReq({ mood: 'amis' }))).resolves.toBeTruthy();
  });

  it('ne compte rien quand le forfait est illimité', async () => {
    const { service } = makeService('gold');
    await expect(
      service.assertAvailable({ name: 'people', feature: 'peopleSuggestionsPerDay' }, userReq()),
    ).resolves.toBeNull();
  });

  it('compte par IP sur une route publique', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const { service } = makeService(null, { [`quota:places-city:ip:1.2.3.4:${day}`]: 300 });
    await expect(
      service.assertAvailable({ name: 'places-city', anonymousPerDay: 300 }, anonReq()),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('laisse passer si Redis est indisponible', async () => {
    const { service, redisRaw } = makeService('free');
    redisRaw.get.mockRejectedValueOnce(new Error('down'));
    await expect(
      service.assertAvailable({ name: 'chatbot', feature: 'chatbotPerDay' }, userReq()),
    ).resolves.toBeNull();
  });
});
