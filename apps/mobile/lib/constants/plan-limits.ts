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
  // Quotas quotidiens du forfait Gratuit, arrêtés avec l'utilisateur.
  chatbotPerDay: 5,          // messages envoyés à l'assistant
  desirePerDay: 5,           // réponses de « Dis-moi ton envie »
  itineraryPerModePerDay: 3, // COMPTÉ PAR MODE (date, amis, voyage…)
  surprisePerDay: 3,         // lancers de dé
  universeLoadsPerDay: 3,    // COMPTÉ PAR UNIVERS
  mapLoadsPerDay: 3,         // COMPTÉ PAR UNIVERS, « tous » compris
  // Pas d'entrée « météo » : les cartes « À faire maintenant » ouvrent
  // l'écran univers, qui applique déjà ses 3 chargements et ses 5 lieux. Un
  // compteur séparé donnerait six chargements par univers à qui passe par la
  // météo, ce qui n'est pas la règle voulue.
  peopleSuggestionsPerDay: 10,
  eventsPerDay: 2,
} as const;

/**
 * Combien de lieux le forfait Gratuit voit à chaque chargement.
 *
 * Distinct d'un quota : rien n'est compté, la liste est simplement coupée.
 * Le serveur continue d'en renvoyer davantage — couper ici garde le cache et
 * la pagination intacts, et un passage à Plus révèle le reste sans recharger.
 */
export const FREE_DISPLAY_CAPS = {
  universePlaces: 5,
  mapPlaces: 5,
  explorerSectionPlaces: 3,
} as const;

export type DisplayCap = keyof typeof FREE_DISPLAY_CAPS;

/** Plafonds d'affichage du palier courant — Gratuit seul est bridé. */
export const DISPLAY_CAPS_BY_PLAN: Record<Plan, Record<DisplayCap, number>> = {
  free: FREE_DISPLAY_CAPS,
  // Même règle que les quotas : le double de ce que voit le Gratuit.
  plus: Object.fromEntries(
    Object.entries(FREE_DISPLAY_CAPS).map(([cap, value]) => [cap, value * 2]),
  ) as Record<DisplayCap, number>,
  gold: { universePlaces: 15, mapPlaces: 15, explorerSectionPlaces: 8 },
  diamond: {
    universePlaces: Infinity, mapPlaces: Infinity, explorerSectionPlaces: Infinity,
  },
};

/**
 * Fonctionnalités entièrement réservées aux forfaits payants — ce n'est plus
 * un quota mais une porte : la carte sociale (visibilité, membres visibles,
 * signal) reste fermée tant que le compte est Gratuit.
 */
/**
 * Le palier payant juste au-dessus — `null` quand il n'y a plus rien à
 * vendre.
 *
 * Une limite atteinte se propose de lever avec le palier SUIVANT : un abonné
 * Plus à qui l'on propose Plus lit une offre absurde, et le prix affiché
 * n'est même pas celui qui le débloquerait.
 */
export function nextPaidPlan(current: Plan): Exclude<Plan, 'free'> | null {
  switch (current) {
    case 'free': return 'plus';
    case 'plus': return 'gold';
    case 'gold': return 'diamond';
    default: return null;
  }
}

export const PREMIUM_ONLY_FEATURES = ['socialMap'] as const;
export type PremiumOnlyFeature = (typeof PREMIUM_ONLY_FEATURES)[number];

export type LimitedFeature = keyof typeof FREE_LIMITS;

/**
 * Plus (2,99 €) = le Gratuit DOUBLÉ, à une exception près : For You passe de
 * 15 à 25 lieux par jour.
 *
 * Écrit comme un calcul et non comme une liste de nombres : la règle voulue
 * est « le double du Gratuit », et une liste recopiée à la main divergerait
 * au premier ajustement d'une valeur du Gratuit — sans que rien ne le
 * signale.
 */
const PLUS_LIMITS: Record<LimitedFeature, number> = {
  // Le cast accompagne Object.entries, qui perd le type des clés ; les clés
  // viennent de FREE_LIMITS, donc l'objet est complet par construction.
  ...(Object.fromEntries(
    Object.entries(FREE_LIMITS).map(([feature, value]) => [feature, value * 2]),
  ) as Record<LimitedFeature, number>),
  suggestionsPerDay: 25,
};

/** Free = valeurs ci-dessus ; Diamond = toujours illimité (Infinity). */
export const LIMITS_BY_PLAN: Record<Plan, Record<LimitedFeature, number>> = {
  free: FREE_LIMITS,
  plus: PLUS_LIMITS,
  // Gold (5,99 €) : valeurs arrêtées une par une, sans règle de calcul — le
  // rapport au Gratuit n'y est pas constant (l'assistant quadruple, les
  // itinéraires triplent), donc les écrire est ici plus honnête que les
  // dériver.
  gold: {
    suggestionsPerDay: 30,
    chatbotPerDay: 20,
    desirePerDay: 20,
    itineraryPerModePerDay: 9,
    surprisePerDay: 9,
    universeLoadsPerDay: 9,
    mapLoadsPerDay: 9,
    peopleSuggestionsPerDay: 30,
    eventsPerDay: 8,
    // Quotas hérités, pas encore revus avec l'utilisateur : gardés au-dessus
    // de Plus pour que la progression reste vraie.
    plannerPerWeek: 30, predictivePerWeek: 20,
    circleMaxMembers: 50, passportMaxEntries: 1000, travelCities: 80,
  },
  diamond: {
    suggestionsPerDay: Infinity, plannerPerWeek: Infinity, predictivePerWeek: Infinity,
    circleMaxMembers: Infinity, passportMaxEntries: Infinity, travelCities: Infinity,
    chatbotPerDay: Infinity, desirePerDay: Infinity, itineraryPerModePerDay: Infinity,
    surprisePerDay: Infinity, universeLoadsPerDay: Infinity, mapLoadsPerDay: Infinity,
    peopleSuggestionsPerDay: Infinity, eventsPerDay: Infinity,
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
  // Un seul message pour les quotas quotidiens : il dit la seule chose utile
  // — c'est reparti demain, ou tout de suite en passant à Plus. Un texte par
  // fonctionnalité aurait demandé treize traductions chacun pour une nuance
  // que l'écran donne déjà par son contexte.
  chatbotPerDay: 'limit_daily_reached',
  desirePerDay: 'limit_daily_reached',
  itineraryPerModePerDay: 'limit_daily_reached',
  surprisePerDay: 'limit_daily_reached',
  universeLoadsPerDay: 'limit_daily_reached',
  mapLoadsPerDay: 'limit_daily_reached',
  peopleSuggestionsPerDay: 'limit_daily_reached',
  eventsPerDay: 'limit_daily_reached',
};

/**
 * Nom de ce qui est compté, par fonctionnalité.
 *
 * Le message d'une limite atteinte annonce le chiffre exact et ce qu'il
 * compte — « 3 chargements par jour », « 5 messages par jour ». Un texte
 * vague (« limite atteinte ») laisse l'utilisateur deviner ce qu'il a
 * consommé et à partir de quand ça repart.
 */
export const LIMIT_UNIT_KEYS: Partial<Record<LimitedFeature, TranslationKey>> = {
  chatbotPerDay: 'limit_unit_messages',
  desirePerDay: 'limit_unit_searches',
  itineraryPerModePerDay: 'limit_unit_itineraries',
  surprisePerDay: 'limit_unit_rolls',
  universeLoadsPerDay: 'limit_unit_loads',
  mapLoadsPerDay: 'limit_unit_loads',
  peopleSuggestionsPerDay: 'limit_unit_profiles',
  eventsPerDay: 'limit_unit_events',
  suggestionsPerDay: 'limit_unit_places',
};

/** Période de réinitialisation d'un compteur d'usage (pour les limites temporelles). */
export const LIMIT_PERIOD: Record<LimitedFeature, 'day' | 'week' | 'none'> = {
  suggestionsPerDay: 'day',
  plannerPerWeek: 'week',
  predictivePerWeek: 'week',
  circleMaxMembers: 'none', // basé sur le nombre réel de membres
  passportMaxEntries: 'none', // basé sur le nombre réel d'entrées
  travelCities: 'none', // basé sur le nombre réel de villes
  chatbotPerDay: 'day',
  desirePerDay: 'day',
  itineraryPerModePerDay: 'day',
  surprisePerDay: 'day',
  universeLoadsPerDay: 'day',
  mapLoadsPerDay: 'day',
  peopleSuggestionsPerDay: 'day',
  eventsPerDay: 'day',
};
