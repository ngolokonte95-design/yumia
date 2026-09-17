/**
 * Quotas par forfait — table unique lue par l'app (usePlanLimits, écran
 * d'abonnement) ET par l'API (common/quota). Modifier une valeur ici la
 * modifie des deux côtés.
 */
import type { Plan } from './gamification';

// Le Gratuit doit permettre une séance de découverte entière : personne ne
// s'abonne à une app dont il n'a pas vu ce qu'elle sait faire.
export const FREE_LIMITS = {
  chatbotPerDay: 10,         // messages envoyés à l'assistant
  desirePerDay: 6,           // réponses de « Dis-moi ton envie »
  itineraryPerModePerDay: 3, // COMPTÉ PAR MODE (date, amis, voyage…)
  surprisePerDay: 5,         // lancers de dé
  universeLoadsPerDay: 5,    // COMPTÉ PAR UNIVERS
  mapLoadsPerDay: 5,         // COMPTÉ PAR UNIVERS, « tous » compris
  // Pas d'entrée « météo » : les cartes « À faire maintenant » ouvrent
  // l'écran univers, qui applique déjà ses chargements et ses lieux. Un
  // compteur séparé doublerait le quota pour qui passe par la météo.
  suggestionsPerDay: 20,     // For You
  peopleSuggestionsPerDay: 10,
  eventsPerDay: 2,
  circleMaxMembers: 5,
  passportMaxEntries: 30,
} as const;

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
    chatbotPerDay: 20,
    desirePerDay: 20,
    itineraryPerModePerDay: 6,
    surprisePerDay: 12,
    universeLoadsPerDay: 12,
    mapLoadsPerDay: 10,
    suggestionsPerDay: 40,
    peopleSuggestionsPerDay: 30,
    eventsPerDay: 10,
    circleMaxMembers: 10,
    passportMaxEntries: 150,
  },

  gold: {
    chatbotPerDay: 30,
    desirePerDay: 20,
    itineraryPerModePerDay: 10,
    surprisePerDay: 20,
    universeLoadsPerDay: 10,
    mapLoadsPerDay: 10,
    suggestionsPerDay: 40,
    // Ce qui ne coûte qu'à notre propre serveur s'ouvre dès Gold : le saut de
    // palier se sent, sans nous exposer.
    peopleSuggestionsPerDay: Infinity,
    eventsPerDay: Infinity,
    // 15 et non le maximum de l'écran (20) : sans cet écart, Gold et Diamond
    // offriraient exactement la même chose sur cette ligne.
    circleMaxMembers: 15,
    passportMaxEntries: Infinity,
  },

  // Diamond n'est pas « illimité » partout, et c'est délibéré : sans plafond
  // sur l'assistant ou les itinéraires, un seul compte automatisé coûterait
  // en une journée plus que son abonnement d'un mois. Ces valeurs sont assez
  // hautes pour qu'aucun usage humain ne les rencontre, assez basses pour
  // qu'un script ne vide pas le budget.
  diamond: {
    chatbotPerDay: 50,
    desirePerDay: 40,
    itineraryPerModePerDay: 15,
    surprisePerDay: 40,
    universeLoadsPerDay: 15,
    mapLoadsPerDay: 15,
    suggestionsPerDay: 80,
    peopleSuggestionsPerDay: Infinity,
    eventsPerDay: Infinity,
    // « Illimité » ne voulait rien dire ici : l'écran de groupe plafonne à 20.
    circleMaxMembers: 20,
    passportMaxEntries: Infinity,
  },
};
