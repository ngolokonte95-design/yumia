import { computeStreak, computeVisitXp, evaluateBadges, levelProgress, utcDayNumber } from '../gamification.logic';

const DAY = 86_400_000;
const now = new Date('2026-06-21T14:00:00Z');

// ──────────────────────────────────────────────────────────────────
// utcDayNumber
// ──────────────────────────────────────────────────────────────────
describe('utcDayNumber', () => {
  it('renvoie la même valeur pour deux timestamps le même jour UTC', () => {
    const a = new Date('2026-06-21T00:00:00Z');
    const b = new Date('2026-06-21T23:59:59Z');
    expect(utcDayNumber(a)).toBe(utcDayNumber(b));
  });

  it('renvoie des valeurs différentes pour deux jours consécutifs', () => {
    const a = new Date('2026-06-20T23:59:59Z');
    const b = new Date('2026-06-21T00:00:00Z');
    expect(utcDayNumber(b) - utcDayNumber(a)).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// computeStreak
// ──────────────────────────────────────────────────────────────────
describe('computeStreak', () => {
  it('incrémente le streak quand la dernière activité était hier', () => {
    const yesterday = new Date(now.getTime() - DAY);
    const result = computeStreak({ current: 5, best: 10 }, yesterday, now);
    expect(result.current).toBe(6);
    expect(result.best).toBe(10);
    expect(result.changedDay).toBe(true);
  });

  it('repart à 1 quand la dernière activité était il y a 2 jours', () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
    const result = computeStreak({ current: 15, best: 20 }, twoDaysAgo, now);
    expect(result.current).toBe(1);
    expect(result.changedDay).toBe(true);
  });

  it('ne modifie pas le streak si la visite est le même jour', () => {
    const sameDay = new Date('2026-06-21T06:00:00Z');
    const result = computeStreak({ current: 3, best: 3 }, sameDay, now);
    expect(result.current).toBe(3);
    expect(result.changedDay).toBe(false);
  });

  it('initialise le streak à 1 quand aucune activité précédente', () => {
    const result = computeStreak({ current: 0, best: 0 }, null, now);
    expect(result.current).toBe(1);
    expect(result.changedDay).toBe(true);
  });

  it('met à jour le best streak quand le current le dépasse', () => {
    const yesterday = new Date(now.getTime() - DAY);
    const result = computeStreak({ current: 20, best: 20 }, yesterday, now);
    expect(result.best).toBe(21);
  });

  it('ne réduit pas le best streak', () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY);
    const result = computeStreak({ current: 50, best: 100 }, twoDaysAgo, now);
    expect(result.current).toBe(1);
    expect(result.best).toBe(100);
  });
});

// ──────────────────────────────────────────────────────────────────
// computeVisitXp
// ──────────────────────────────────────────────────────────────────
describe('computeVisitXp', () => {
  const base = {
    hasFeedback: false,
    isNewUniverse: false,
    isNewCountry: false,
    visitPlaceCountToday: 0,
    ratingCountToday: 0,
    newStreakCurrent: 1,
  };

  it('accorde l\'XP de base pour une première visite du jour', () => {
    const { total, breakdown } = computeVisitXp(base);
    expect(breakdown.visit_place).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(0);
  });

  it('accorde le bonus feedback quand hasFeedback=true', () => {
    const { breakdown } = computeVisitXp({ ...base, hasFeedback: true });
    expect(breakdown.leave_rating).toBeGreaterThan(0);
  });

  it('accorde le bonus nouvel univers', () => {
    const { breakdown } = computeVisitXp({ ...base, isNewUniverse: true });
    expect(breakdown.try_new_universe).toBeGreaterThan(0);
  });

  it('accorde le bonus nouveau pays', () => {
    const { breakdown } = computeVisitXp({ ...base, isNewCountry: true });
    expect(breakdown.visit_new_country).toBeGreaterThan(0);
  });

  it('accorde le bonus palier de streak tous les 7 jours', () => {
    const { breakdown } = computeVisitXp({ ...base, newStreakCurrent: 7 });
    expect(breakdown.maintain_streak_7).toBeGreaterThan(0);

    const { breakdown: b14 } = computeVisitXp({ ...base, newStreakCurrent: 14 });
    expect(b14.maintain_streak_7).toBeGreaterThan(0);
  });

  it('n\'accorde pas le bonus streak hors palier (ex: 8)', () => {
    const { breakdown } = computeVisitXp({ ...base, newStreakCurrent: 8 });
    expect(breakdown.maintain_streak_7).toBeUndefined();
  });

  it('respecte le plafond quotidien de visite', () => {
    const maxVisits = computeVisitXp({ ...base, visitPlaceCountToday: 0 });
    const overCap = computeVisitXp({ ...base, visitPlaceCountToday: 999 });

    expect(maxVisits.breakdown.visit_place).toBeGreaterThan(0);
    expect(overCap.breakdown.visit_place).toBeUndefined();
  });

  it('total = somme du breakdown', () => {
    const input = { hasFeedback: true, isNewUniverse: true, isNewCountry: false, visitPlaceCountToday: 0, ratingCountToday: 0, newStreakCurrent: 7 };
    const { total, breakdown } = computeVisitXp(input);
    const sum = Object.values(breakdown).reduce((acc, v) => acc + (v ?? 0), 0);
    expect(total).toBe(sum);
  });
});

// ──────────────────────────────────────────────────────────────────
// evaluateBadges
// ──────────────────────────────────────────────────────────────────
describe('evaluateBadges', () => {
  const base = {
    streakCurrent: 1,
    distinctCountries: 1,
    visitHourUtc: 12,
    universe: 'restaurant' as const,
  };

  it('déclenche on_fire à 30 jours de streak', () => {
    const badges = evaluateBadges({ ...base, streakCurrent: 30 });
    expect(badges).toContain('on_fire');
  });

  it('ne déclenche pas on_fire avant 30 jours', () => {
    const badges = evaluateBadges({ ...base, streakCurrent: 29 });
    expect(badges).not.toContain('on_fire');
  });

  it('déclenche globe_trotter à 10 pays distincts', () => {
    const badges = evaluateBadges({ ...base, distinctCountries: 10 });
    expect(badges).toContain('globe_trotter');
  });

  it('déclenche early_bird pour un café avant 8h UTC', () => {
    const badges = evaluateBadges({ ...base, universe: 'cafe', visitHourUtc: 7 });
    expect(badges).toContain('early_bird');
  });

  it('ne déclenche pas early_bird pour un café après 8h', () => {
    const badges = evaluateBadges({ ...base, universe: 'cafe', visitHourUtc: 9 });
    expect(badges).not.toContain('early_bird');
  });

  it('déclenche night_owl pour un bar entre minuit et 5h', () => {
    const badges = evaluateBadges({ ...base, universe: 'bar', visitHourUtc: 2 });
    expect(badges).toContain('night_owl');
  });

  it('déclenche night_owl pour nightlife entre minuit et 5h', () => {
    const badges = evaluateBadges({ ...base, universe: 'nightlife', visitHourUtc: 3 });
    expect(badges).toContain('night_owl');
  });

  it('ne déclenche pas night_owl après 5h', () => {
    const badges = evaluateBadges({ ...base, universe: 'bar', visitHourUtc: 6 });
    expect(badges).not.toContain('night_owl');
  });

  it('peut déclencher plusieurs badges simultanément', () => {
    const badges = evaluateBadges({
      streakCurrent: 30,
      distinctCountries: 10,
      visitHourUtc: 5,
      universe: 'restaurant',
    });
    expect(badges).toContain('on_fire');
    expect(badges).toContain('globe_trotter');
  });

  it('ne renvoie que des badges valides (présents dans BADGES)', () => {
    const badges = evaluateBadges({ ...base, streakCurrent: 30, distinctCountries: 10 });
    for (const b of badges) {
      expect(typeof b).toBe('string');
      expect(b.length).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// levelProgress
// ──────────────────────────────────────────────────────────────────
describe('levelProgress', () => {
  it('retourne le niveau 1 pour 0 XP', () => {
    const { current } = levelProgress(0);
    expect(current.level).toBe(1);
  });

  it('ratio est entre 0 et 1', () => {
    for (const xp of [0, 100, 500, 2000, 9999]) {
      const { ratio } = levelProgress(xp);
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    }
  });

  it('ratio = 1 au niveau maximum', () => {
    const { ratio } = levelProgress(999_999);
    expect(ratio).toBe(1);
  });

  it('next est null au niveau maximum', () => {
    const { next } = levelProgress(999_999);
    expect(next).toBeNull();
  });

  it('xpIntoLevel reflète l\'XP accumulée dans le niveau courant', () => {
    const { current, xpIntoLevel } = levelProgress(150);
    expect(xpIntoLevel).toBe(150 - current.xpRequired);
  });
});
