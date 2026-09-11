import {
  FREE_LIMITS,
  FREE_DISPLAY_CAPS,
  LIMITS_BY_PLAN,
  DISPLAY_CAPS_BY_PLAN,
  type LimitedFeature,
  type DisplayCap,
} from '../constants/plan-limits';

describe('paliers', () => {
  it('Plus vaut le double du Gratuit, sauf For You', () => {
    // La règle métier tient en une phrase ; ce test est là pour qu'elle
    // survive à un ajustement fait d'un seul côté.
    for (const feature of Object.keys(FREE_LIMITS) as LimitedFeature[]) {
      const expected = feature === 'suggestionsPerDay' ? 25 : FREE_LIMITS[feature] * 2;
      expect({ feature, value: LIMITS_BY_PLAN.plus[feature] }).toEqual({ feature, value: expected });
    }
    for (const cap of Object.keys(FREE_DISPLAY_CAPS) as DisplayCap[]) {
      expect(DISPLAY_CAPS_BY_PLAN.plus[cap]).toBe(FREE_DISPLAY_CAPS[cap] * 2);
    }
  });

  it('un palier supérieur n’est jamais plus avare que celui d’en dessous', () => {
    for (const feature of Object.keys(FREE_LIMITS) as LimitedFeature[]) {
      const { free, plus, gold, diamond } = LIMITS_BY_PLAN;
      expect(plus[feature]).toBeGreaterThanOrEqual(free[feature]);
      expect(gold[feature]).toBeGreaterThanOrEqual(plus[feature]);
      expect(diamond[feature]).toBeGreaterThanOrEqual(gold[feature]);
    }
  });
});
