/**
 * Limites par palier d'abonnement + messages d'upsell contextuels.
 *
 * Ce fichier est le SEUL endroit à modifier pour ajuster un palier :
 * LIMITS_BY_PLAN et DISPLAY_CAPS_BY_PLAN sont les seules sources lues par
 * usePlanLimits, et l'écran d'abonnement construit sa grille comparative à
 * partir d'elles — les chiffres annoncés ne peuvent donc pas diverger de ceux
 * appliqués.
 *
 * POURQUOI LA CARTE MONTE MOINS QUE LES RAYONS. Une zone neuve ouverte
 * depuis un rayon coûte UNE recherche au fournisseur ; la même zone ouverte
 * depuis la carte en « Tous » en coûte DIX-SEPT, le serveur interrogeant
 * autant de catégories pour densifier (MAP_DENSITY_UNIVERSES, côté API). Une
 * zone déjà couverte, elle, ne coûte rien pendant sept jours — d'où des
 * chargements de rayon tenus un cran au-dessus de ceux de la carte.
 *
 * RÈGLE DE DIMENSIONNEMENT. Un quota compté PAR PORTÉE (par univers, par
 * mode) se multiplie par le nombre de portées : 20 chargements par univers,
 * ce sont 640 recherches de lieux possibles sur 32 rayons, toutes facturées.
 * Ces lignes-là restent basses même quand le chiffre paraît petit. Un quota
 * global, lui, ne se multiplie par rien et peut être généreux.
 */
import { FREE_LIMITS, LIMITS_BY_PLAN, type LimitedFeature, type Plan } from '@yumia/shared';

// Les quotas vivent dans @yumia/shared : l'API applique la même table
// (common/quota), et le serveur ne doit jamais bloquer avant l'app.
export { FREE_LIMITS, LIMITS_BY_PLAN, type LimitedFeature };
import type { TranslationKey } from '../translations';


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
  universePlaces: 7,
  mapPlaces: 8,
  explorerSectionPlaces: 4,
  // Univers ouvert depuis une suggestion de la météo : un aperçu, pas la
  // liste complète (3 en Gratuit, 6 en Gold, 9 en Diamond).
  weatherUniversePlaces: 3,
} as const;

export type DisplayCap = keyof typeof FREE_DISPLAY_CAPS;

/** Plafonds d'affichage du palier courant — Gratuit seul est bridé. */
export const DISPLAY_CAPS_BY_PLAN: Record<Plan, Record<DisplayCap, number>> = {
  free: FREE_DISPLAY_CAPS,
  plus: { universePlaces: 15, mapPlaces: 20, explorerSectionPlaces: 8, weatherUniversePlaces: 3 },
  gold: { universePlaces: 12, mapPlaces: 25, explorerSectionPlaces: 10, weatherUniversePlaces: 6 },
  diamond: { universePlaces: 20, mapPlaces: 40, explorerSectionPlaces: 15, weatherUniversePlaces: 9 },
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
    // Plus n'est plus vendu (cf. SOLD_PLANS) : Gratuit et les anciens Plus
    // montent directement à Gold.
    case 'free':
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
