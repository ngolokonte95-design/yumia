import { normalizeShopLocale, translationTarget } from '../product-locales';
import { ProductTranslationService } from '../product-translation.service';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { RedisService } from '../../../infra/redis/redis.service';
import { AliExpressApiError, type AliExpressService } from '../aliexpress.service';

describe('translationTarget', () => {
  it("n'appelle pas AliExpress pour le français", () => {
    expect(translationTarget('fr')).toBeNull();
  });

  it('demande à AliExpress les langues qu’il gère, sous leur propre locale', () => {
    expect(translationTarget('en')).toEqual({ storeLocale: 'en', aliexpressLanguage: 'EN' });
    expect(translationTarget('de')).toEqual({ storeLocale: 'de', aliexpressLanguage: 'DE' });
    expect(translationTarget('ar')).toEqual({ storeLocale: 'ar', aliexpressLanguage: 'AR' });
    expect(translationTarget('ru')).toEqual({ storeLocale: 'ru', aliexpressLanguage: 'RU' });
  });

  it('sert l’anglais (stocké sous en) au suédois, au chinois et au hindi', () => {
    for (const l of ['sv', 'zh', 'hi']) {
      expect(translationTarget(l)).toEqual({ storeLocale: 'en', aliexpressLanguage: 'EN' });
    }
  });

  it('retombe sur le français pour une locale inconnue', () => {
    expect(normalizeShopLocale('xx')).toBe('fr');
    expect(normalizeShopLocale(undefined)).toBe('fr');
    expect(normalizeShopLocale('EN')).toBe('en');
    expect(translationTarget('en-US')).toBeNull();
  });
});

const makeDeps = (rows: Array<{ productId: string; title: string; description: string | null }> = []) => {
  const prisma = {
    productTranslation: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ title: create.title, description: create.description })),
    },
    product: { findUnique: jest.fn().mockResolvedValue({ aliexpressProductId: 'ae-1' }) },
  };
  const aliexpress = {
    isConfigured: jest.fn().mockReturnValue(true),
    getProductText: jest.fn().mockResolvedValue({ title: 'Phone case', description: 'A sturdy case' }),
  };
  const redis = { raw: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(1) } };
  const service = new ProductTranslationService(
    prisma as unknown as PrismaService,
    aliexpress as unknown as AliExpressService,
    redis as unknown as RedisService,
  );
  return { prisma, aliexpress, redis, service };
};

describe('ProductTranslationService.localize', () => {
  it('applique la traduction en cache', async () => {
    const { service } = makeDeps([{ productId: 'p1', title: 'Phone case', description: null }]);
    const out = await service.localize([{ id: 'p1', title: 'Coque de téléphone', priceCents: 990 }], 'en');
    expect(out).toEqual([{ id: 'p1', title: 'Phone case', priceCents: 990 }]);
  });

  it('remplace la description seulement si l’objet en porte une et que la traduction en a une', async () => {
    const { service } = makeDeps([{ productId: 'p1', title: 'Hülle', description: 'Robuste Hülle' }]);
    const [withDesc] = await service.localize([{ id: 'p1', title: 'Coque', description: 'Coque solide' }], 'de');
    expect(withDesc).toEqual({ id: 'p1', title: 'Hülle', description: 'Robuste Hülle' });
    const [withoutDesc] = await service.localize([{ id: 'p1', title: 'Coque' }], 'de');
    expect(withoutDesc).not.toHaveProperty('description');
  });

  it('garde le français et met en file un produit sans traduction', async () => {
    const { service } = makeDeps([]);
    const enqueue = jest.spyOn(service as unknown as { enqueue: (j: unknown) => void }, 'enqueue').mockImplementation(() => undefined);
    const out = await service.localize([{ id: 'p1', title: 'Coque' }], 'sv');
    expect(out).toEqual([{ id: 'p1', title: 'Coque' }]);
    expect(enqueue).toHaveBeenCalledWith({ productId: 'p1', target: { storeLocale: 'en', aliexpressLanguage: 'EN' } });
  });

  it('plafonne les produits mis en file par affichage', async () => {
    const { service } = makeDeps([]);
    const enqueue = jest.spyOn(service as unknown as { enqueue: (j: unknown) => void }, 'enqueue').mockImplementation(() => undefined);
    const products = Array.from({ length: ProductTranslationService.MAX_ENQUEUE_PER_CALL + 20 }, (_, i) => ({ id: `p${i}`, title: 'Coque' }));
    await service.localize(products, 'es');
    expect(enqueue).toHaveBeenCalledTimes(ProductTranslationService.MAX_ENQUEUE_PER_CALL);
  });

  it('ne touche à rien en français', async () => {
    const { service, prisma } = makeDeps([]);
    const products = [{ id: 'p1', title: 'Coque' }];
    expect(await service.localize(products, 'fr')).toBe(products);
    expect(prisma.productTranslation.findMany).not.toHaveBeenCalled();
  });

  it('renvoie le français si la base échoue, sans lever d’erreur', async () => {
    const { service, prisma } = makeDeps([]);
    prisma.productTranslation.findMany.mockRejectedValue(new Error('db down'));
    jest.spyOn(service as unknown as { enqueue: (j: unknown) => void }, 'enqueue').mockImplementation(() => undefined);
    await expect(service.localize([{ id: 'p1', title: 'Coque' }], 'it')).resolves.toEqual([{ id: 'p1', title: 'Coque' }]);
  });

  it('la file traduit en arrière-plan et enregistre le résultat', async () => {
    const { service, aliexpress, prisma } = makeDeps([]);
    await service.localize([{ id: 'p1', title: 'Coque' }], 'en');
    // Laisse la file se vider (appels simulés, tous résolus immédiatement).
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    expect(aliexpress.getProductText).toHaveBeenCalledWith('ae-1', 'EN');
    expect(prisma.productTranslation.upsert).toHaveBeenCalled();
  });
});

describe('ProductTranslationService.localizeDetail', () => {
  it('attend la traduction manquante et l’enregistre', async () => {
    const { service, prisma } = makeDeps([]);
    const out = await service.localizeDetail({ id: 'p1', title: 'Coque', description: 'Coque solide' }, 'en');
    expect(out).toEqual({ id: 'p1', title: 'Phone case', description: 'A sturdy case' });
    expect(prisma.productTranslation.upsert).toHaveBeenCalled();
  });

  it('renvoie le français si AliExpress ne répond rien', async () => {
    const { service, aliexpress } = makeDeps([]);
    aliexpress.getProductText.mockResolvedValue(null);
    const out = await service.localizeDetail({ id: 'p1', title: 'Coque', description: 'Coque solide' }, 'pl');
    expect(out).toEqual({ id: 'p1', title: 'Coque', description: 'Coque solide' });
  });

  it('renvoie le français si AliExpress lève une erreur', async () => {
    const { service, aliexpress } = makeDeps([]);
    aliexpress.getProductText.mockRejectedValue(new Error('timeout'));
    const out = await service.localizeDetail({ id: 'p1', title: 'Coque', description: null }, 'nl');
    expect(out).toEqual({ id: 'p1', title: 'Coque', description: null });
  });
});

describe('ProductTranslationService — limites et absences chez AliExpress', () => {
  it('limite d\'appels : « rate_limited », verrou levé, rien marqué indisponible', async () => {
    const { service, aliexpress, redis } = makeDeps([]);
    aliexpress.getProductText.mockRejectedValue(new AliExpressApiError('ApiCallLimit', 'App Call limited'));
    await expect(service.translateNow('p1', 'de')).resolves.toBe('rate_limited');
    expect(redis.raw.del).toHaveBeenCalledWith('shop:tr:p1:de');
    expect(redis.raw.set).not.toHaveBeenCalledWith('shop:tr-none:p1:de', expect.anything(), expect.anything(), expect.anything());
  });

  it('vraie absence de la langue : mémorisée 24 h, puis plus redemandée', async () => {
    const { service, aliexpress, redis } = makeDeps([]);
    aliexpress.getProductText.mockResolvedValue(null);
    await expect(service.translateNow('p1', 'ru')).resolves.toBe('failed');
    expect(redis.raw.set).toHaveBeenCalledWith('shop:tr-none:p1:ru', '1', 'EX', ProductTranslationService.UNAVAILABLE_TTL_SECONDS);

    redis.raw.get.mockResolvedValue('1');
    aliexpress.getProductText.mockClear();
    await service.translateNow('p1', 'ru');
    expect(aliexpress.getProductText).not.toHaveBeenCalled();
  });

  it('reconnaît une limite d\'appels dans le code ou le message AliExpress', () => {
    expect(new AliExpressApiError('ApiCallLimit', '').isRateLimit).toBe(true);
    expect(new AliExpressApiError('isv.error', 'Api access frequency exceeds the limit').isRateLimit).toBe(true);
    expect(new AliExpressApiError('isv.product-not-exist', 'Product not found').isRateLimit).toBe(false);
  });
});
