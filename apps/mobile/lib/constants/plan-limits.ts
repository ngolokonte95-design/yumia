/**
 * Limites du forfait Gratuit + messages d'upsell contextuels.
 * En Premium, toutes ces limites sautent (cf. usePlanLimits).
 */

export const FREE_LIMITS = {
  suggestionsPerDay: 15,
  plannerPerWeek: 3,
  predictivePerWeek: 2,
  circleMaxMembers: 5,
  passportMaxEntries: 30,
  travelCities: 6,
} as const;

export type LimitedFeature = keyof typeof FREE_LIMITS;

/** Message affiché par PremiumUpsellModal quand chaque limite est atteinte. */
export const LIMIT_MESSAGES: Record<LimitedFeature, string> = {
  suggestionsPerDay:
    'Tu as utilisé tes 15 suggestions du jour. Passe en Premium pour des suggestions illimitées pour seulement 2.99€/mois. 👑',
  plannerPerWeek:
    'Tu as déjà planifié 3 soirées cette semaine. En Premium, planifie autant de soirées que tu veux pour seulement 2.99€/mois. 👑',
  predictivePerWeek:
    'Tu as utilisé tes 2 suggestions anticipées de la semaine. En Premium, YUMIA anticipe ta vie sociale chaque jour pour seulement 2.99€/mois. 👑',
  circleMaxMembers:
    'Ton cercle est limité à 5 personnes. Invite jusqu\'à 20 proches pour seulement 2.99€/mois avec le forfait Premium. 👑',
  passportMaxEntries:
    'Ton Passport est plein. Garde une mémoire illimitée de toutes tes expériences pour seulement 2.99€/mois avec le forfait Premium. 👑',
  travelCities:
    'Le Mode Voyage gratuit est limité à 6 villes. Explore le monde entier sans limite pour seulement 2.99€/mois avec le forfait Premium. 👑',
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
