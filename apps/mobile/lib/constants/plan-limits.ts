/**
 * Limites par palier d'abonnement + messages d'upsell contextuels.
 *
 * Valeurs Plus/Gold/Diamond PROVISOIRES — restrictions définitives pas
 * encore arrêtées. Ce fichier est le SEUL endroit à modifier pour les
 * ajuster plus tard : LIMITS_BY_PLAN est la seule source consultée par
 * usePlanLimits.ts.
 */
import type { Plan } from '@yumia/shared';
import type { TranslationKey } from '../translations';

export const FREE_LIMITS = {
  suggestionsPerDay: 15,
  plannerPerWeek: 3,
  predictivePerWeek: 2,
  circleMaxMembers: 5,
  passportMaxEntries: 30,
  travelCities: 6,
} as const;

export type LimitedFeature = keyof typeof FREE_LIMITS;

/** Free = valeurs ci-dessus ; Diamond = toujours illimité (Infinity). */
export const LIMITS_BY_PLAN: Record<Plan, Record<LimitedFeature, number>> = {
  free: FREE_LIMITS,
  plus: {
    suggestionsPerDay: 50, plannerPerWeek: 10, predictivePerWeek: 7,
    circleMaxMembers: 20, passportMaxEntries: 200, travelCities: 25,
  },
  gold: {
    suggestionsPerDay: 150, plannerPerWeek: 30, predictivePerWeek: 20,
    circleMaxMembers: 50, passportMaxEntries: 1000, travelCities: 80,
  },
  diamond: {
    suggestionsPerDay: Infinity, plannerPerWeek: Infinity, predictivePerWeek: Infinity,
    circleMaxMembers: Infinity, passportMaxEntries: Infinity, travelCities: Infinity,
  },
};

/**
 * Clé de traduction du message affiché par PremiumUpsellModal quand la limite
 * Free est atteinte — traduit à l'usage (usePlanLimits) pour rester dans la
 * locale de l'utilisateur, avec {price} interpolé depuis PLUS_PRICE_EUR.
 */
export const LIMIT_MESSAGE_KEYS: Record<LimitedFeature, TranslationKey> = {
  suggestionsPerDay: 'limit_suggestions_per_day',
  plannerPerWeek: 'limit_planner_per_week',
  predictivePerWeek: 'limit_predictive_per_week',
  circleMaxMembers: 'limit_circle_max_members',
  passportMaxEntries: 'limit_passport_max_entries',
  travelCities: 'limit_travel_cities',
};

/** Période de réinitialisation d'un compteur d'usage (pour les limites temporelles). */
export const LIMIT_PERIOD: Record<LimitedFeature, 'day' | 'week' | 'none'> = {
  suggestionsPerDay: 'day',
  plannerPerWeek: 'week',
  predictivePerWeek: 'week',
  circleMaxMembers: 'none', // basé sur le nombre réel de membres
  passportMaxEntries: 'none', // basé sur le nombre réel d'entrées
  travelCities: 'none', // basé sur le nombre réel de villes
};
