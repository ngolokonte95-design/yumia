import { AliExpressService, maxDeliveryDays, type ShippingOption } from '../aliexpress.service';

describe('maxDeliveryDays', () => {
  it('prend la borne haute d\'une fourchette', () => {
    expect(maxDeliveryDays('7-15')).toBe(15);
    expect(maxDeliveryDays('15 - 35')).toBe(35);
  });

  it('accepte un délai unique, texte ou nombre', () => {
    expect(maxDeliveryDays('12')).toBe(12);
    expect(maxDeliveryDays(9)).toBe(9);
  });

  it('renvoie null quand rien n\'est lisible', () => {
    expect(maxDeliveryDays('')).toBeNull();
    expect(maxDeliveryDays(undefined)).toBeNull();
    expect(maxDeliveryDays('bientôt')).toBeNull();
  });
});

describe('fastestShipping', () => {
  const withOptions = (options: ShippingOption[]) => {
    const service = Object.create(AliExpressService.prototype) as AliExpressService;
    jest.spyOn(service, 'shippingOptions').mockResolvedValue(options);
    return service;
  };

  it('choisit le plus rapide, même s\'il est payant', async () => {
    const service = withOptions([
      { serviceName: 'CAINIAO_STANDARD', maxDays: 25, feeCents: 0, tracking: true },
      { serviceName: 'DHL', maxDays: 7, feeCents: 1890, tracking: true },
      { serviceName: 'AE_PREMIUM', maxDays: 12, feeCents: 490, tracking: true },
    ]);
    await expect(service.fastestShipping('1', 'FR', 1)).resolves.toMatchObject({ serviceName: 'DHL' });
  });

  it('à délai égal : le suivi, puis le moins cher', async () => {
    const service = withOptions([
      { serviceName: 'SANS_SUIVI', maxDays: 10, feeCents: 100, tracking: false },
      { serviceName: 'CHER', maxDays: 10, feeCents: 900, tracking: true },
      { serviceName: 'MOINS_CHER', maxDays: 10, feeCents: 400, tracking: true },
    ]);
    await expect(service.fastestShipping('1', 'FR', 1)).resolves.toMatchObject({ serviceName: 'MOINS_CHER' });
  });

  it('aucune option : null, la commande garde le transporteur par défaut', async () => {
    const service = withOptions([]);
    await expect(service.fastestShipping('1', 'FR', 1)).resolves.toBeNull();
  });
});
