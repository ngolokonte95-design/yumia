/**
 * Assistant Idées cadeaux — référentiel des occasions, destinataires et budgets.
 *
 * Le principe : trois questions (pour qui / quelle occasion / quel budget)
 * traduites en un filtre sur le catalogue existant. Aucune donnée nouvelle,
 * aucune table — la boutique fournit déjà les 5 000 produits.
 *
 * Le mapping vit ici, côté serveur, et non dans l'application : ajuster les
 * rayons d'une occasion ne doit pas demander une nouvelle version sur les
 * stores. Les libellés sont en français, comme le reste de la boutique
 * (`ShopCategory.nameFr`).
 */

// ── Arithmétique du calendrier ──────────────────────────────────────────────
//
// Cinq occasions sur sept n'ont pas de date fixe. Les coder en dur les rendrait
// fausses l'année suivante, en silence — un assistant qui propose la fête des
// mères en octobre ne se signale pas, il se contente d'être inutile.

/** Date UTC à minuit — toutes les comparaisons se font sur le jour, pas l'heure. */
function utc(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

/**
 * Dimanche de Pâques (grégorien), algorithme de Meeus/Jones/Butcher.
 * Nécessaire pour la fête des mères française, dont la règle dépend de la
 * Pentecôte.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}

/** N-ième jour de semaine d'un mois (`weekday` : 0 = dimanche). */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Date {
  const first = utc(year, month0, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month0, 1 + shift + (n - 1) * 7);
}

/** Dernier jour de semaine d'un mois (`weekday` : 0 = dimanche). */
function lastWeekdayOfMonth(year: number, month0: number, weekday: number): Date {
  const last = utc(year, month0 + 1, 0);
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return utc(year, month0, last.getUTCDate() - shift);
}

/** Fête des grands-mères en France : premier dimanche de mars. */
export function frenchGrandmothersDay(year: number): Date {
  return nthWeekdayOfMonth(year, 2, 0, 1);
}

/** Fête des grands-pères en France : premier dimanche d'octobre. */
export function frenchGrandfathersDay(year: number): Date {
  return nthWeekdayOfMonth(year, 9, 0, 1);
}

/**
 * Fête des mères en France : dernier dimanche de mai — sauf si ce jour est
 * celui de la Pentecôte (Pâques + 49 jours), auquel cas elle est reportée au
 * premier dimanche de juin. C'est arrivé en 2004, 2015 et 2023 ; la règle est
 * inscrite au Code de l'action sociale et des familles.
 */
export function frenchMothersDay(year: number): Date {
  const lastSundayOfMay = lastWeekdayOfMonth(year, 4, 0);
  const pentecost = new Date(easterSunday(year).getTime() + 49 * 86_400_000);
  return lastSundayOfMay.getTime() === pentecost.getTime()
    ? nthWeekdayOfMonth(year, 5, 0, 1)
    : lastSundayOfMay;
}

/** Fête des pères en France : troisième dimanche de juin. */
export function frenchFathersDay(year: number): Date {
  return nthWeekdayOfMonth(year, 5, 0, 3);
}

// ── Occasions ───────────────────────────────────────────────────────────────

export interface GiftOccasion {
  slug: string;
  label: string;
  emoji: string;
  /** Rayons privilégiés. Vide = toute la boutique. */
  categories: string[];
  /**
   * Dates de l'occasion pour une année donnée. `null` pour une occasion
   * permanente (un anniversaire n'a pas de saison).
   *
   * Un tableau, et non une date : la fête des grands-parents tombe DEUX fois
   * par an (mars pour les grands-mères, octobre pour les grands-pères). Avec
   * une date unique, celle de mars une fois passée aurait renvoyé à mars de
   * l'année suivante, faisant disparaître octobre du calendrier.
   */
  datesFor: ((year: number) => Date[]) | null;
  /**
   * Combien de jours avant la date l'occasion devient pertinente. Long pour
   * Noël, où l'on s'y prend d'avance ; court pour une fête des grands-pères,
   * à laquelle personne ne pense six semaines plus tôt.
   */
  leadDays: number;
}

export const GIFT_OCCASIONS: readonly GiftOccasion[] = [
  {
    slug: 'fete-des-grands-parents',
    label: 'Fête des grands-parents',
    emoji: '🧓',
    categories: ['fleuriste', 'cafe-the', 'lecture', 'spa-massage', 'cake-design', 'bricolage', 'coiffure-beaute'],
    // Deux échéances distinctes dans l'année : premier dimanche de mars pour
    // les grands-mères, premier dimanche d'octobre pour les grands-pères.
    datesFor: (y) => [frenchGrandmothersDay(y), frenchGrandfathersDay(y)],
    leadDays: 21,
  },
  {
    slug: 'noel',
    label: 'Noël',
    emoji: '🎄',
    categories: ['jouets-cadeaux', 'gadgets-tech', 'bijoux-montres', 'bureau-teletravail', 'loisirs-creatifs', 'cake-design', 'meuble-deco', 'cinema-maison'],
    datesFor: (y) => [utc(y, 11, 25)],
    leadDays: 45,
  },
  {
    slug: 'nouvel-an',
    label: 'Nouvel An',
    emoji: '🎆',
    categories: ['soiree-karaoke', 'cake-design', 'bijoux-montres', 'gadgets-tech', 'cinema-maison'],
    datesFor: (y) => [utc(y, 11, 31)],
    leadDays: 20,
  },
  {
    slug: 'saint-valentin',
    label: 'Saint-Valentin',
    emoji: '💝',
    categories: ['bijoux-montres', 'spa-massage', 'coiffure-beaute', 'meuble-deco', 'cake-design', 'cinema-maison'],
    datesFor: (y) => [utc(y, 1, 14)],
    leadDays: 25,
  },
  {
    slug: 'fete-des-meres',
    label: 'Fête des mères',
    emoji: '💐',
    categories: ['spa-massage', 'coiffure-beaute', 'bijoux-montres', 'fleuriste', 'yoga-bien-etre', 'cake-design'],
    datesFor: (y) => [frenchMothersDay(y)],
    leadDays: 25,
  },
  {
    slug: 'fete-des-peres',
    label: 'Fête des pères',
    emoji: '🛠️',
    categories: ['barbier', 'auto-moto', 'bricolage', 'gadgets-tech', 'cafe-the', 'sport'],
    datesFor: (y) => [frenchFathersDay(y)],
    leadDays: 25,
  },
  {
    slug: 'anniversaire',
    label: 'Anniversaire',
    emoji: '🎂',
    categories: [],
    datesFor: null,
    leadDays: 0,
  },
  {
    slug: 'anniversaire-mariage',
    label: 'Anniversaire de mariage',
    emoji: '💍',
    categories: ['bijoux-montres', 'spa-massage', 'fleuriste', 'meuble-deco', 'cake-design', 'cinema-maison'],
    datesFor: null,
    leadDays: 0,
  },
  {
    slug: 'juste-pour-offrir',
    label: 'Juste pour offrir',
    emoji: '🎁',
    categories: [],
    datesFor: null,
    leadDays: 0,
  },
];

// ── Destinataires ───────────────────────────────────────────────────────────

export interface GiftRecipient {
  slug: string;
  label: string;
  emoji: string;
  categories: string[];
}

export const GIFT_RECIPIENTS: readonly GiftRecipient[] = [
  { slug: 'femme', label: 'Une femme', emoji: '👩', categories: ['coiffure-beaute', 'bijoux-montres', 'spa-massage', 'yoga-bien-etre', 'onglerie', 'cils-sourcils', 'meuble-deco', 'fleuriste'] },
  { slug: 'homme', label: 'Un homme', emoji: '👨', categories: ['barbier', 'auto-moto', 'bricolage', 'gadgets-tech', 'sport', 'cafe-the', 'velo-mobilite'] },
  { slug: 'enfant', label: 'Un enfant', emoji: '🧒', categories: ['jouets-cadeaux', 'loisirs-creatifs', 'piscine-aquatique', 'velo-mobilite'] },
  { slug: 'ado', label: 'Un ado', emoji: '🎧', categories: ['gadgets-tech', 'bureau-teletravail', 'soiree-karaoke', 'sport', 'photo-creation', 'velo-mobilite'] },
  { slug: 'couple', label: 'Un couple', emoji: '💑', categories: ['spa-massage', 'cinema-maison', 'cake-design', 'meuble-deco', 'pique-nique'] },
  { slug: 'ami', label: 'Un ami', emoji: '🤝', categories: ['cafe-the', 'bureau-teletravail', 'lecture', 'gadgets-tech', 'meuble-deco', 'soiree-karaoke'] },
  { slug: 'voyageur', label: 'Un voyageur', emoji: '🧳', categories: ['voyage', 'randonnee', 'camping', 'plage-vacances', 'photo-creation'] },
  { slug: 'cuisinier', label: 'Un cuisinier', emoji: '👩‍🍳', categories: ['cuisine', 'cake-design', 'cafe-the', 'pique-nique'] },
  { slug: 'animal', label: 'Un animal', emoji: '🐾', categories: ['animalerie'] },
];

// ── Budgets ─────────────────────────────────────────────────────────────────

export interface GiftBudget {
  slug: string;
  label: string;
  minCents: number;
  /** `null` = pas de plafond. */
  maxCents: number | null;
}

export const GIFT_BUDGETS: readonly GiftBudget[] = [
  { slug: 'petit', label: "Jusqu'à 20 €", minCents: 0, maxCents: 2000 },
  { slug: 'moyen', label: '20 à 50 €', minCents: 2000, maxCents: 5000 },
  { slug: 'grand', label: '50 à 100 €', minCents: 5000, maxCents: 10000 },
  { slug: 'genereux', label: 'Plus de 100 €', minCents: 10000, maxCents: null },
  { slug: 'peu-importe', label: 'Peu importe', minCents: 0, maxCents: null },
];

// ── Saisonnalité ────────────────────────────────────────────────────────────

export interface OccasionTiming {
  /** Prochaine échéance, `null` pour une occasion permanente. */
  date: Date | null;
  /** Jours restants, `null` pour une occasion permanente. */
  daysUntil: number | null;
  /** `true` si l'occasion est dans sa fenêtre de pertinence. */
  isNow: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Prochaine occurrence d'une occasion et son urgence.
 *
 * Si la date de l'année en cours est passée, on bascule sur l'année suivante —
 * sans quoi la Saint-Valentin afficherait « il y a 300 jours » dès le 15 février.
 */
export function timingOf(occasion: GiftOccasion, now: Date): OccasionTiming {
  if (!occasion.datesFor) return { date: null, daysUntil: null, isNow: false };

  const today = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const year = today.getUTCFullYear();

  // On regarde l'année en cours ET la suivante, puis on retient la première
  // échéance encore à venir. Inclure l'année suivante est ce qui permet à une
  // occasion déjà passée de basculer proprement, sans cas particulier.
  const date = [...occasion.datesFor(year), ...occasion.datesFor(year + 1)]
    .filter((d) => d.getTime() >= today.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const daysUntil = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  return { date, daysUntil, isNow: daysUntil <= occasion.leadDays };
}

/** Les rayons à interroger, en croisant destinataire et occasion. */
export function categoriesFor(recipient?: GiftRecipient, occasion?: GiftOccasion): string[] {
  const byRecipient = recipient?.categories ?? [];
  const byOccasion = occasion?.categories ?? [];

  if (!byRecipient.length) return byOccasion;
  if (!byOccasion.length) return byRecipient;

  // Le destinataire prime : offrir un rasoir à sa mère pour la fête des mères
  // resterait « de saison » mais raterait la cible. On ne garde donc
  // l'intersection que si elle est assez fournie pour remplir un écran.
  const intersection = byRecipient.filter((c) => byOccasion.includes(c));
  return intersection.length >= 2 ? intersection : byRecipient;
}
