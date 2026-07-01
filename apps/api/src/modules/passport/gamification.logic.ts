/**
 * Logique de gamification **pure** (aucune dépendance DB) : calcul d'XP, de
 * streak et évaluation des badges. Le service orchestre la persistance autour.
 */
import {
  BADGES,
  LEVELS,
  XP_RULES,
  levelForXp,
  type Badge,
  type Level,
  type XpAction,
} from '@yumia/shared';

/** Détail de l'XP gagnée par action lors d'une visite. */
export type XpBreakdown = Partial<Record<XpAction, number>>;

export interface VisitXpInput {
  hasFeedback: boolean;
  isNewUniverse: boolean;
  isNewCountry: boolean;
  /** Nombre de visites déjà comptées aujourd'hui (avant celle-ci). */
  visitPlaceCountToday: number;
  ratingCountToday: number;
  /** Valeur du streak APRÈS mise à jour (pour détecter un palier de 7). */
  newStreakCurrent: number;
}

/** Applique les règles d'XP (plafonds quotidiens inclus) et renvoie le détail. */
export function computeVisitXp(input: VisitXpInput): { total: number; breakdown: XpBreakdown } {
  const breakdown: XpBreakdown = {};

  const underCap = (action: XpAction, countToday: number): boolean => {
    const max = XP_RULES[action].maxPerDay;
    return max === null || countToday < max;
  };

  if (underCap('visit_place', input.visitPlaceCountToday)) {
    breakdown.visit_place = XP_RULES.visit_place.xp;
  }
  if (input.hasFeedback && underCap('leave_rating', input.ratingCountToday)) {
    breakdown.leave_rating = XP_RULES.leave_rating.xp;
  }
  if (input.isNewUniverse) {
    breakdown.try_new_universe = XP_RULES.try_new_universe.xp;
  }
  if (input.isNewCountry) {
    breakdown.visit_new_country = XP_RULES.visit_new_country.xp;
  }
  if (input.newStreakCurrent > 0 && input.newStreakCurrent % 7 === 0) {
    breakdown.maintain_streak_7 = XP_RULES.maintain_streak_7.xp;
  }

  const total = Object.values(breakdown).reduce((sum, xp) => sum + (xp ?? 0), 0);
  return { total, breakdown };
}

/** Convertit une date en numéro de jour UTC (pour comparer des journées). */
export function utcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

export interface StreakState {
  current: number;
  best: number;
}

/**
 * Met à jour le streak selon le dernier jour d'activité.
 * - même jour → inchangé ; - veille → +1 ; - sinon → repart à 1.
 */
export function computeStreak(
  previous: StreakState,
  lastActivityDay: Date | null,
  now: Date,
): StreakState & { changedDay: boolean } {
  const today = utcDayNumber(now);
  const last = lastActivityDay ? utcDayNumber(lastActivityDay) : null;

  if (last === today) {
    return { current: previous.current, best: previous.best, changedDay: false };
  }
  const current = last !== null && today - last === 1 ? previous.current + 1 : 1;
  const best = Math.max(previous.best, current);
  return { current, best, changedDay: true };
}

export interface BadgeEvalInput {
  streakCurrent: number;
  distinctCountries: number;
  /** Heure UTC de la visite (0–23) et univers, pour les badges horaires. */
  visitHourUtc: number;
  universe: string;
}

/** Renvoie les badges *candidats* déclenchés par cette visite (avant dédup DB). */
export function evaluateBadges(input: BadgeEvalInput): Badge[] {
  const earned: Badge[] = [];
  if (input.streakCurrent >= 30) earned.push('on_fire');
  if (input.distinctCountries >= 10) earned.push('globe_trotter');
  if (input.universe === 'cafe' && input.visitHourUtc < 8) earned.push('early_bird');
  if (
    (input.universe === 'bar' || input.universe === 'nightlife') &&
    input.visitHourUtc >= 0 &&
    input.visitHourUtc < 5
  ) {
    earned.push('night_owl');
  }
  return earned.filter((b) => (BADGES as readonly string[]).includes(b));
}

/** Progression vers le niveau suivant (pour l'affichage mobile). */
export function levelProgress(totalXp: number): {
  current: Level;
  next: Level | null;
  xpIntoLevel: number;
  xpForNext: number | null;
  ratio: number;
} {
  const current = levelForXp(totalXp);
  const idx = LEVELS.findIndex((l) => l.level === current.level);
  const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;

  const xpIntoLevel = totalXp - current.xpRequired;
  if (!next) {
    return { current, next: null, xpIntoLevel, xpForNext: null, ratio: 1 };
  }
  const span = next.xpRequired - current.xpRequired;
  return {
    current,
    next,
    xpIntoLevel,
    xpForNext: span,
    ratio: span > 0 ? Math.min(1, xpIntoLevel / span) : 0,
  };
}
