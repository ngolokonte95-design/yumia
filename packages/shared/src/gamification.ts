/**
 * Système de gamification YUMIA (section 9 du PRD) : XP, niveaux, badges, streaks.
 * Source unique de vérité partagée entre backend (calcul) et mobile (affichage).
 */

// ---- XP ----------------------------------------------------------------

export const XP_ACTIONS = [
  'visit_place',
  'leave_rating',
  'share_place',
  'maintain_streak_7',
  'visit_new_country',
  'try_new_universe',
  'invite_friend_joined',
  'complete_weekly_challenge',
] as const;

export type XpAction = (typeof XP_ACTIONS)[number];

export interface XpRule {
  action: XpAction;
  xp: number;
  /** Plafond de fréquence ; null = illimité. */
  maxPerDay: number | null;
}

export const XP_RULES: Record<XpAction, XpRule> = {
  visit_place: { action: 'visit_place', xp: 50, maxPerDay: 5 },
  leave_rating: { action: 'leave_rating', xp: 20, maxPerDay: 5 },
  share_place: { action: 'share_place', xp: 30, maxPerDay: 3 },
  maintain_streak_7: { action: 'maintain_streak_7', xp: 200, maxPerDay: null },
  visit_new_country: { action: 'visit_new_country', xp: 500, maxPerDay: null },
  try_new_universe: { action: 'try_new_universe', xp: 100, maxPerDay: null },
  invite_friend_joined: { action: 'invite_friend_joined', xp: 300, maxPerDay: null },
  complete_weekly_challenge: { action: 'complete_weekly_challenge', xp: 250, maxPerDay: null },
};

// ---- Niveaux -----------------------------------------------------------

export interface Level {
  level: number;
  emoji: string;
  titleFr: string;
  xpRequired: number;
}

export const LEVELS: Level[] = [
  { level: 1, emoji: '🍃', titleFr: 'Curieux', xpRequired: 0 },
  { level: 2, emoji: '☕', titleFr: 'Habitué', xpRequired: 500 },
  { level: 3, emoji: '🍽️', titleFr: 'Explorateur', xpRequired: 2000 },
  { level: 4, emoji: '🌍', titleFr: 'Voyageur', xpRequired: 5000 },
  { level: 5, emoji: '⭐', titleFr: 'Connaisseur', xpRequired: 12000 },
  { level: 6, emoji: '🏆', titleFr: 'Légende YUMIA', xpRequired: 30000 },
];

/** Renvoie le niveau atteint pour un total d'XP donné. */
export function levelForXp(totalXp: number): Level {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXp >= lvl.xpRequired) current = lvl;
    else break;
  }
  return current;
}

// ---- Badges (12 au lancement) -----------------------------------------

export const BADGES = [
  'early_bird',
  'night_owl',
  'globe_trotter',
  'sushi_master',
  'romantic',
  'super_parent',
  'on_fire',
  'adventurer',
  'influencer',
  'local_expert',
  'frequent_flyer',
  'social_star',
] as const;

export type Badge = (typeof BADGES)[number];

export interface BadgeMeta {
  key: Badge;
  emoji: string;
  nameFr: string;
  conditionFr: string;
}

export const BADGE_META: Record<Badge, BadgeMeta> = {
  early_bird: { key: 'early_bird', emoji: '🌅', nameFr: 'Lève-Tôt', conditionFr: 'Visiter un café avant 8h' },
  night_owl: { key: 'night_owl', emoji: '🌙', nameFr: 'Noctambule', conditionFr: 'Visiter un bar après minuit' },
  globe_trotter: { key: 'globe_trotter', emoji: '🌍', nameFr: 'Globe-Trotter', conditionFr: 'Explorer 10 pays différents' },
  sushi_master: { key: 'sushi_master', emoji: '🍣', nameFr: 'Sushi Master', conditionFr: 'Visiter 20 restaurants japonais' },
  romantic: { key: 'romantic', emoji: '❤️', nameFr: 'Romantique', conditionFr: 'Utiliser Date Mode 5 fois' },
  super_parent: { key: 'super_parent', emoji: '👨‍👩‍👧', nameFr: 'Super Parent', conditionFr: 'Utiliser Family Mode 10 fois' },
  on_fire: { key: 'on_fire', emoji: '🔥', nameFr: 'On Fire', conditionFr: 'Maintenir un streak de 30 jours' },
  adventurer: { key: 'adventurer', emoji: '🎲', nameFr: 'Aventurier', conditionFr: 'Utiliser Surprise Me 15 fois' },
  influencer: { key: 'influencer', emoji: '📸', nameFr: 'Influenceur', conditionFr: 'Partager 50 lieux' },
  local_expert: { key: 'local_expert', emoji: '🏙️', nameFr: 'Local Expert', conditionFr: 'Explorer 100 lieux dans sa ville' },
  frequent_flyer: { key: 'frequent_flyer', emoji: '✈️', nameFr: 'Frequent Flyer', conditionFr: 'Utiliser Travel Mode dans 5 villes' },
  social_star: { key: 'social_star', emoji: '👥', nameFr: 'Social Star', conditionFr: 'Organiser 10 sorties en groupe' },
};

// ---- Abonnement --------------------------------------------------------

export const PLANS = ['free', 'plus'] as const;
export type Plan = (typeof PLANS)[number];

/** Limites Freemium (section 12 du PRD). Free = 85-90% des fonctionnalités. */
export const PLAN_LIMITS = {
  free: { savedPlacesMax: 50, simultaneousFilters: 3, streakFreezePerMonth: 0, travelItineraryDays: 3 },
  plus: { savedPlacesMax: Infinity, simultaneousFilters: Infinity, streakFreezePerMonth: 2, travelItineraryDays: 7 },
} as const;

export const PLUS_PRICE_EUR = 2.99;
