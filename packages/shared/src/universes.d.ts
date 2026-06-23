/**
 * Les 14 univers YUMIA disponibles au lancement.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi quatorze expériences du quotidien.
 */
export declare const UNIVERSES: readonly ["restaurant", "cafe", "bakery", "dessert", "bar", "bubble_tea", "local_specialty", "ice_cream", "chocolatier", "wine_cellar", "tourist_activity", "rooftop", "cultural_outing", "nightlife"];
export type Universe = (typeof UNIVERSES)[number];
export interface UniverseMeta {
    key: Universe;
    emoji: string;
    /** Clé i18n ; libellé FR fourni comme repli. */
    i18nKey: string;
    labelFr: string;
}
export declare const UNIVERSE_META: Record<Universe, UniverseMeta>;
export declare const isUniverse: (v: string) => v is Universe;
