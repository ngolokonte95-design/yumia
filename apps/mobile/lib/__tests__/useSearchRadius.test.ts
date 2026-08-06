import { sanitizeRadiusKm, DEFAULT_RADIUS_KM } from '../useSearchRadius';

describe('sanitizeRadiusKm', () => {
  it('laisse passer une valeur numérique valide', () => {
    expect(sanitizeRadiusKm(10)).toBe(10);
  });

  it('arrondit les valeurs non entières', () => {
    expect(sanitizeRadiusKm(7.6)).toBe(8);
  });

  it('convertit une chaîne numérique (valeur relue du stockage)', () => {
    expect(sanitizeRadiusKm('20')).toBe(20);
  });

  it('retombe sur le défaut pour une chaîne invalide', () => {
    expect(sanitizeRadiusKm('abc')).toBe(DEFAULT_RADIUS_KM);
  });

  it('retombe sur le défaut pour zéro ou négatif', () => {
    expect(sanitizeRadiusKm(0)).toBe(DEFAULT_RADIUS_KM);
    expect(sanitizeRadiusKm(-5)).toBe(DEFAULT_RADIUS_KM);
  });

  it('retombe sur le défaut pour NaN/Infinity', () => {
    expect(sanitizeRadiusKm(NaN)).toBe(DEFAULT_RADIUS_KM);
    expect(sanitizeRadiusKm(Infinity)).toBe(DEFAULT_RADIUS_KM);
  });

  it('plafonne les valeurs excessives à 200 km', () => {
    expect(sanitizeRadiusKm(999)).toBe(200);
  });
});
