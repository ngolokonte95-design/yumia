/**
 * Univers YUMIA — expériences du quotidien.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi toutes les expériences proposées.
 *
 * Ordre du tableau = ordre d'affichage dans la grille home (par catégorie logique).
 */
export declare const UNIVERSES: readonly ["restaurant", "cafe", "bakery", "fast_food", "dessert", "ice_cream", "chocolatier", "bubble_tea", "wine_cellar", "tea_house", "local_specialty", "bar", "pub", "nightclub", "hookah", "live_music", "rooftop", "karaoke", "museum", "monument", "tourist_activity", "cultural_outing", "cinema", "zoo", "amusement_park", "photo_spot", "park", "beach", "fitness", "aquatic", "padel", "escape_game", "laser_game", "karting", "bowling", "casino", "spa", "massage", "nail_salon", "hair_salon", "barber", "florist", "shopping", "mall", "market", "bookstore", "jewelry", "place_of_worship", "library", "coworking", "gare", "hotel", "event_venue"];
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
