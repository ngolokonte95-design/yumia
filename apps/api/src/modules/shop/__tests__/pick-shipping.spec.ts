import { maxDeliveryDays, pickShipping, type ShippingOption } from '../aliexpress.service';

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

describe('pickShipping — le plus rapide à 3 € maximum', () => {
  const opt = (serviceName: string, maxDays: number, feeCents: number | null, tracking = true): ShippingOption =>
    ({ serviceName, maxDays, feeCents, tracking });

  it('écarte l\'express trop cher et prend le Standard à 3 €', () => {
    expect(pickShipping([
      opt('CAINIAO_ECONOMY', 35, 0),
      opt('CAINIAO_STANDARD', 15, 300),
      opt('DHL', 7, 1890),
    ])?.serviceName).toBe('CAINIAO_STANDARD');
  });

  it('prend plus rapide que le Standard si c\'est au même prix ou moins', () => {
    expect(pickShipping([
      opt('CAINIAO_STANDARD', 15, 300),
      opt('AE_SELECTION', 10, 250),
    ])?.serviceName).toBe('AE_SELECTION');
  });

  it('à délai égal : le suivi, puis le moins cher', () => {
    expect(pickShipping([
      opt('SANS_SUIVI', 12, 100, false),
      opt('CHER', 12, 300),
      opt('MOINS_CHER', 12, 200),
    ])?.serviceName).toBe('MOINS_CHER');
  });

  it('rien sous 3 € : le moins cher, jamais l\'express par défaut', () => {
    expect(pickShipping([
      opt('DHL', 5, 2500),
      opt('PREMIUM', 9, 650),
    ])?.serviceName).toBe('PREMIUM');
  });

  it('des frais inconnus ne passent pas pour gratuits', () => {
    expect(pickShipping([
      opt('INCONNU', 4, null),
      opt('CAINIAO_STANDARD', 15, 300),
    ])?.serviceName).toBe('CAINIAO_STANDARD');
  });

  it('aucune option : null, la commande garde le transporteur par défaut', () => {
    expect(pickShipping([])).toBeNull();
  });
});
