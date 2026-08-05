/**
 * Développement des règles de récurrence RFC 5545 (RRULE).
 *
 * Volontairement limité au sous-ensemble réellement utile à un calendrier
 * personnel : FREQ, INTERVAL, COUNT, UNTIL et BYDAY hebdomadaire. Embarquer une
 * bibliothèque complète pour couvrir des cas comme « le 3ᵉ jeudi ouvré du
 * trimestre » serait payer très cher une exhaustivité que personne n'utilise.
 *
 * Le module est pur (aucune dépendance, aucun accès base) : c'est ce qui le
 * rend testable exhaustivement.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ParsedRule {
  freq: Frequency;
  /** Une occurrence toutes les `interval` périodes. Toujours ≥ 1. */
  interval: number;
  /** Nombre total d'occurrences, série comprise. */
  count?: number;
  /** Dernière date possible (incluse). */
  until?: Date;
  /**
   * Jours de la semaine pour FREQ=WEEKLY, en indices JS (0 = dimanche).
   * Vide = on garde le jour de la date de départ.
   */
  byDay: number[];
}

const DAY_CODES: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

const FREQUENCIES: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/**
 * Analyse une RRULE. Retourne `null` si la règle est absente ou inexploitable —
 * l'appelant traite alors l'événement comme ponctuel, ce qui est le
 * comportement sûr : mieux vaut une occurrence unique qu'une série erronée.
 */
export function parseRRule(rrule?: string | null): ParsedRule | null {
  if (!rrule?.trim()) return null;

  const parts = new Map<string, string>();
  for (const chunk of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = chunk.split('=');
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const freq = parts.get('FREQ')?.toUpperCase() as Frequency | undefined;
  if (!freq || !FREQUENCIES.includes(freq)) return null;

  const rawInterval = Number(parts.get('INTERVAL') ?? 1);
  // Un intervalle nul ou négatif produirait une boucle infinie.
  const interval = Number.isFinite(rawInterval) && rawInterval >= 1
    ? Math.floor(rawInterval)
    : 1;

  const rawCount = Number(parts.get('COUNT'));
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : undefined;

  const until = parseUntil(parts.get('UNTIL'));

  const byDay = (parts.get('BYDAY') ?? '')
    .split(',')
    .map((d) => DAY_CODES[d.trim().toUpperCase()])
    .filter((d): d is number => d !== undefined);

  return { freq, interval, count, until, byDay };
}

/** UNTIL est au format basique ISO : `20261231T235959Z` ou `20261231`. */
function parseUntil(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(raw.trim());
  if (!m) return undefined;
  const [, y, mo, d, h = '23', mi = '59', s = '59'] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Ajoute `n` mois en gardant le dernier jour du mois si la date déborde. */
function addMonths(date: Date, n: number): Date {
  const day = date.getUTCDate();
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + n);

  // Le 31 janvier + 1 mois n'existe pas : on retombe sur le 28/29 février
  // plutôt que de déborder sur mars, ce que ferait un setUTCMonth naïf.
  const daysInMonth = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0,
  )).getUTCDate();
  shifted.setUTCDate(Math.min(day, daysInMonth));
  return shifted;
}

/** Ajoute `n` années, en gérant le 29 février. */
function addYears(date: Date, n: number): Date {
  return addMonths(date, n * 12);
}

/** Garde-fou contre une règle pathologique qui générerait à l'infini. */
const MAX_OCCURRENCES = 1000;

/**
 * Développe les occurrences d'un événement récurrent qui **chevauchent** la
 * fenêtre `[rangeStart, rangeEnd]`.
 *
 * @param start        Début de la première occurrence (instant UTC).
 * @param durationMs   Durée d'une occurrence, pour tester le chevauchement.
 * @param rule         Règle analysée, ou `null` pour un événement ponctuel.
 * @param excluded     Occurrences supprimées de la série.
 */
export function expandOccurrences(
  start: Date,
  durationMs: number,
  rule: ParsedRule | null,
  rangeStart: Date,
  rangeEnd: Date,
  excluded: Date[] = [],
): Date[] {
  const excludedKeys = new Set(excluded.map((d) => d.getTime()));

  const overlaps = (occurrence: Date) => {
    const end = occurrence.getTime() + durationMs;
    return end >= rangeStart.getTime() && occurrence.getTime() <= rangeEnd.getTime();
  };

  if (!rule) {
    return overlaps(start) && !excludedKeys.has(start.getTime()) ? [start] : [];
  }

  const results: Date[] = [];
  const seeds = rule.freq === 'WEEKLY' && rule.byDay.length > 0
    ? weeklySeeds(start, rule.byDay)
    : [start];

  let emitted = 0;
  let step = 0;

  while (step < MAX_OCCURRENCES) {
    let anyBeforeRangeEnd = false;

    for (const seed of seeds) {
      const occurrence = advance(seed, rule.freq, rule.interval * step);

      if (occurrence.getTime() < start.getTime()) continue;
      if (rule.until && occurrence.getTime() > rule.until.getTime()) continue;

      // COUNT compte toutes les occurrences de la série, y compris celles
      // situées avant la fenêtre demandée — sinon la fin de série se
      // décalerait selon le mois consulté.
      emitted += 1;
      if (rule.count && emitted > rule.count) return results;

      if (occurrence.getTime() <= rangeEnd.getTime()) anyBeforeRangeEnd = true;
      if (overlaps(occurrence) && !excludedKeys.has(occurrence.getTime())) {
        results.push(occurrence);
      }
    }

    // Toutes les occurrences de ce pas dépassent la fenêtre : inutile d'aller
    // plus loin, elles ne feront que s'en éloigner.
    if (!anyBeforeRangeEnd && step > 0) break;
    step += 1;
  }

  return results;
}

/** Décale une date de `n` périodes de la fréquence donnée. */
function advance(date: Date, freq: Frequency, n: number): Date {
  switch (freq) {
    case 'DAILY': return new Date(date.getTime() + n * 86_400_000);
    case 'WEEKLY': return new Date(date.getTime() + n * 7 * 86_400_000);
    case 'MONTHLY': return addMonths(date, n);
    case 'YEARLY': return addYears(date, n);
  }
}

/**
 * Pour une règle hebdomadaire avec BYDAY, produit une date de départ par jour
 * demandé, dans la semaine de `start`.
 */
function weeklySeeds(start: Date, byDay: number[]): Date[] {
  const startDay = start.getUTCDay();
  return byDay
    .slice()
    .sort((a, b) => a - b)
    .map((day) => new Date(start.getTime() + (day - startDay) * 86_400_000));
}
