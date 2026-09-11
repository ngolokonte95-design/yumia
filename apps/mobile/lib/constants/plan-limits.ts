/**
 * Limites par palier d'abonnement + messages d'upsell contextuels.
 *
 * Ce fichier est le SEUL endroit à modifier pour ajuster un palier :
 * LIMITS_BY_PLAN et DISPLAY_CAPS_BY_PLAN sont les seules sources lues par
 * usePlanLimits, et l'écran d'abonnement construit sa grille comparative à
 * partir d'elles — les chiffres annoncés ne peuvent donc pas diverger de ceux
 * appliqués.
 *
 * RÈGLE DE DIMENSIONNEMENT. Un quota compté PAR PORTÉE (par univers, par
 * mode) se multiplie par le nombre de portées : 20 chargements par univers,
 * ce sont 640 recherches de lieux possibles sur 32 rayons, toutes facturées.
 * Ces lignes-là restent basses même quand le chiffre paraît petit. Un quota
 * global, lui, ne se multiplie par rien et peut être généreux.
 */
import type { Plan } from '@yumia/shared';
import type { TranslationKey } from '../translations';

// Le Gratuit doit permettre une séance de découverte entière : personne ne
// s'abonne à une app dont il n'a pas vu ce qu'elle sait faire.
export const FREE_LIMITS = {
  chatbotPerDay: 5,          // messages envoyés à l'assistant
  desirePerDay: 5,           // réponses de « Dis-moi ton envie »
  itineraryPerModePerDay: 3, // COMPTÉ PAR MODE (date, amis, voyage…)
  surprisePerDay: 5,         // lancers de dé
  universeLoadsPerDay: 5,    // COMPTÉ PAR UNIVERS
  mapLoadsPerDay: 5,         // COMPTÉ PAR UNIVERS, « tous » compris
  // Pas d'entrée « météo » : les cartes « À faire maintenant » ouvrent
  // l'écran univers, qui applique déjà ses chargements et ses lieux. Un
  // compteur séparé doublerait le quota pour qui passe par la météo.
  suggestionsPerDay: 15,     // For You
  peopleSuggestionsPerDay: 10,
  eventsPerDay: 2,
  circleMaxMembers: 5,
  passportMaxEntries: 30,
} as const;

/**
 * Combien de lieux le forfait Gratuit voit à chaque chargement.
 *
 * Distinct d'un quota : rien n'est compté, la liste est simplement coupée.
 * Le serveur continue d'en renvoyer davantage — couper ici garde le cache et
 * la pagination intacts, et un passage à Plus révèle le reste sans recharger.
 */
export const FREE_DISPLAY_CAPS = {
  // Couper l'affichage n'économise RIEN : les lieux sont déjà chargés et déjà
  // payés. C'est un levier de perception, et le plus mal vécu — d'où des
  // valeurs qui laissent une page pleine plutôt qu'une page qui semble
  // cassée.
  universePlaces: 8,
  mapPlaces: 8,
  explorerSectionPlaces: 5,
} as const;

export type DisplayCap = keyof typeof FREE_DISPLAY_CAPS;

/** Plafonds d'affichage du palier courant — Gratuit seul est bridé. */
export const DISPLAY_CAPS_BY_PLAN: Record<Plan, Record<DisplayCap, number>> = {
  free: FREE_DISPLAY_CAPS,
  plus: { universePlaces: 15, mapPlaces: 15, explorerSectionPlaces: 8 },
  gold: { universePlaces: 25, mapPlaces: 25, explorerSectionPlaces: 12 },
  diamond: { universePlaces: 30, mapPlaces: 30, explorerSectionPlaces: 15 },
};

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

/**
 * Fonctionnalités entièrement réservées aux forfaits payants — ce n'est plus
 * un quota mais une porte : la carte sociale (visibilité, membres visibles,
 * signal) reste fermée tant que le compte est Gratuit.
 */
export const PREMIUM_ONLY_FEATURES = ['socialMap'] as const;
export type PremiumOnlyFeature = (typeof PREMIUM_ONLY_FEATURES)[number];

export type LimitedFeature = keyof typeof FREE_LIMITS;

/**
 * Les quatre paliers.
 *
 * Chaque valeur est posée à la main : aucune règle de calcul ne survit à la
 * réalité des coûts, qui diffèrent d'une fonctionnalité à l'autre. Un message
 * d'assistant appelle le modèle, un chargement de rayon appelle le
 * fournisseur de lieux, un profil Tind ne coûte que notre propre base — les
 * trois ne peuvent pas suivre le même multiple.
 */
export const LIMITS_BY_PLAN: Record<Plan, Record<LimitedFeature, number>> = {
  free: FREE_LIMITS,

  plus: {
    chatbotPerDay: 15,
    desirePerDay: 15,
    itineraryPerModePerDay: 6,
    surprisePerDay: 12,
    universeLoadsPerDay: 8,
    mapLoadsPerDay: 8,
    suggestionsPerDay: 40,
    peopleSuggestionsPerDay: 30,
    eventsPerDay: 10,
    circleMaxMembers: 10,
    passportMaxEntries: 150,
  },

  gold: {
    chatbotPerDay: 30,
    desirePerDay: 30,
    itineraryPerModePerDay: 10,
    surprisePerDay: 25,
    universeLoadsPerDay: 12,
    mapLoadsPerDay: 12,
    suggestionsPerDay: 60,
    // Ce qui ne coûte qu'à notre propre serveur s'ouvre dès Gold : le saut de
    // palier se sent, sans nous exposer.
    peopleSuggestionsPerDay: Infinity,
    eventsPerDay: Infinity,
    circleMaxMembers: 20, // le maximum proposé par l'écran de groupe
    passportMaxEntries: Infinity,
  },

  // Diamond n'est pas « illimité » partout, et c'est délibéré : sans plafond
  // sur l'assistant ou les itinéraires, un seul compte automatisé coûterait
  // en une journée plus que son abonnement d'un mois. Ces valeurs sont assez
  // hautes pour qu'aucun usage humain ne les rencontre, assez basses pour
  // qu'un script ne vide pas le budget.
  diamond: {
    chatbotPerDay: 60,
    desirePerDay: 60,
    itineraryPerModePerDay: 15,
    surprisePerDay: 40,
    universeLoadsPerDay: 20,
    mapLoadsPerDay: 20,
    suggestionsPerDay: 80,
    peopleSuggestionsPerDay: Infinity,
    eventsPerDay: Infinity,
    circleMaxMembers: Infinity,
    passportMaxEntries: Infinity,
  },
};

/**
 * Clé de traduction du message affiché par PremiumUpsellModal quand la limite
 * Free est atteinte — traduit à l'usage (usePlanLimits) pour rester dans la
 * locale de l'utilisateur, avec {price} interpolé depuis PLUS_PRICE_EUR.
 */
export const LIMIT_MESSAGE_KEYS: Record<LimitedFeature, TranslationKey> = {
  suggestionsPerDay: 'limit_suggestions_per_day',
  circleMaxMembers: 'limit_circle_max_members',
  passportMaxEntries: 'limit_passport_max_entries',
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
  circleMaxMembers: 'none', // basé sur le nombre réel de membres
  passportMaxEntries: 'none', // basé sur le nombre réel d'entrées
  chatbotPerDay: 'day',
  desirePerDay: 'day',
  itineraryPerModePerDay: 'day',
  surprisePerDay: 'day',
  universeLoadsPerDay: 'day',
  mapLoadsPerDay: 'day',
  peopleSuggestionsPerDay: 'day',
  eventsPerDay: 'day',
};
