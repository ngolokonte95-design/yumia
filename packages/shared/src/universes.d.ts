/**
 * Les 14 univers YUMIA disponibles au lancement.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi quatorze expériences du quotidien.
 */
export declare const UNIVERSES: readonly ["restaurant", "cafe", "bakery", "dessert", "bar", "bubble_tea", "local_specialty", "ice_cream", "chocolatier", "wine_cellar", "tourist_activity", "rooftop", "cultural_outing", "nightlife", "nightclub", "pub", "beach", "place_of_worship", "spa", "park", "cinema", "market", "fitness", "live_music", "escape_game", "museum", "zoo", "amusement_park", "bookstore", "tea_house", "karaoke", "library", "bowling", "casino", "art_gallery", "aquatic", "florist", "nail_salon", "hair_salon", "barber", "shopping", "jewelry", "massage", "gare", "hotel", "monument", "mall", "event_venue"];
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
