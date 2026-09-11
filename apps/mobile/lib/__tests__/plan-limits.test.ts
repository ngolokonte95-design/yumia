import {
  nextPaidPlan,
  FREE_LIMITS,
  FREE_DISPLAY_CAPS,
  LIMITS_BY_PLAN,
  DISPLAY_CAPS_BY_PLAN,
  type LimitedFeature,
  type DisplayCap,
} from '../constants/plan-limits';

describe('paliers', () => {
  it('couvre chaque fonctionnalité à chaque palier', () => {
    // Le typage l'impose déjà, mais ce test attrape une cle ajoutee au
    // Gratuit et oubliee ailleurs si quelqu'un elargit un Record avec un cast.
    for (const plan of ['free', 'plus', 'gold', 'diamond'] as const) {
      for (const feature of Object.keys(FREE_LIMITS) as LimitedFeature[]) {
        expect(typeof LIMITS_BY_PLAN[plan][feature]).toBe('number');
      }
    }
  });

  it('un palier supérieur n’est jamais plus avare que celui d’en dessous', () => {
    for (const feature of Object.keys(FREE_LIMITS) as LimitedFeature[]) {
      const { free, plus, gold, diamond } = LIMITS_BY_PLAN;
      expect(plus[feature]).toBeGreaterThanOrEqual(free[feature]);
      expect(gold[feature]).toBeGreaterThanOrEqual(plus[feature]);
      expect(diamond[feature]).toBeGreaterThanOrEqual(gold[feature]);
    }
    // Les plafonds d'affichage suivent la même règle : ils ont été réglés
    // séparément des quotas, donc rien ne garantit leur progression sans ce
    // contrôle.
    for (const cap of Object.keys(FREE_DISPLAY_CAPS) as DisplayCap[]) {
      const { free, plus, gold, diamond } = DISPLAY_CAPS_BY_PLAN;
      expect(plus[cap]).toBeGreaterThanOrEqual(free[cap]);
      expect(gold[cap]).toBeGreaterThanOrEqual(plus[cap]);
      expect(diamond[cap]).toBeGreaterThanOrEqual(gold[cap]);
    }
  });

  it('propose toujours le palier du dessus, et rien au-delà de Diamond', () => {
    // Un abonné Plus à qui l'on propose Plus lit une offre absurde, au prix
    // qu'il paie déjà.
    expect(nextPaidPlan('free')).toBe('plus');
    expect(nextPaidPlan('plus')).toBe('gold');
    expect(nextPaidPlan('gold')).toBe('diamond');
    expect(nextPaidPlan('diamond')).toBeNull();
  });
});
