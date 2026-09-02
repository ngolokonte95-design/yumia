/**
 * Limites par palier d'abonnement + messages d'upsell contextuels.
 *
 * Valeurs Plus/Gold/Diamond PROVISOIRES — restrictions définitives pas
 * encore arrêtées. Ce fichier est le SEUL endroit à modifier pour les
 * ajuster plus tard : LIMITS_BY_PLAN est la seule source consultée par
 * usePlanLimits.ts.
 */
import type { Plan } from '@yumia/shared';

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

/** Message affiché par PremiumUpsellModal quand la limite Free est atteinte. */
export const LIMIT_MESSAGES: Record<LimitedFeature, string> = {
  suggestionsPerDay:
    'Tu as utilisé tes 15 suggestions du jour. Passe en Plus pour aller beaucoup plus loin, à partir de 2.99€/mois. 👑',
  plannerPerWeek:
    'Tu as déjà planifié 3 soirées cette semaine. Passe en Plus pour en planifier bien plus, à partir de 2.99€/mois. 👑',
  predictivePerWeek:
    'Tu as utilisé tes 2 suggestions anticipées de la semaine. Passe en Plus pour que YUMIA anticipe plus souvent ta vie sociale, à partir de 2.99€/mois. 👑',
  circleMaxMembers:
    'Ton cercle est limité à 5 personnes. Passe en Plus pour inviter plus de proches, à partir de 2.99€/mois. 👑',
  passportMaxEntries:
    'Ton Passport est plein. Passe en Plus pour garder une mémoire bien plus large de tes expériences, à partir de 2.99€/mois. 👑',
  travelCities:
    'Le Mode Voyage gratuit est limité à 6 villes. Passe en Plus pour explorer bien plus de villes, à partir de 2.99€/mois. 👑',
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
