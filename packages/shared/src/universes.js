"use strict";
/**
 * Les 14 univers YUMIA disponibles au lancement.
 * RÈGLE ABSOLUE : YUMIA n'est PAS une app de restaurants — « restaurant » n'est
 * qu'un univers parmi quatorze expériences du quotidien.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniverse = exports.UNIVERSE_META = exports.UNIVERSES = void 0;
exports.UNIVERSES = [
    'restaurant',
    'cafe',
    'bakery',
    'dessert',
    'bar',
    'bubble_tea',
    'local_specialty',
    'ice_cream',
    'chocolatier',
    'wine_cellar',
    'tourist_activity',
    'rooftop',
    'cultural_outing',
    'nightlife',
];
exports.UNIVERSE_META = {
    restaurant: { key: 'restaurant', emoji: '🍽️', i18nKey: 'universe.restaurant', labelFr: 'Restaurants' },
    cafe: { key: 'cafe', emoji: '☕', i18nKey: 'universe.cafe', labelFr: 'Cafés' },
    bakery: { key: 'bakery', emoji: '🥐', i18nKey: 'universe.bakery', labelFr: 'Boulangeries' },
    dessert: { key: 'dessert', emoji: '🍰', i18nKey: 'universe.dessert', labelFr: 'Desserts' },
    bar: { key: 'bar', emoji: '🍹', i18nKey: 'universe.bar', labelFr: 'Bars' },
    bubble_tea: { key: 'bubble_tea', emoji: '🧋', i18nKey: 'universe.bubble_tea', labelFr: 'Bubble Tea' },
    local_specialty: { key: 'local_specialty', emoji: '🥩', i18nKey: 'universe.local_specialty', labelFr: 'Spécialités locales' },
    ice_cream: { key: 'ice_cream', emoji: '🍦', i18nKey: 'universe.ice_cream', labelFr: 'Glaciers' },
    chocolatier: { key: 'chocolatier', emoji: '🍫', i18nKey: 'universe.chocolatier', labelFr: 'Chocolatiers' },
    wine_cellar: { key: 'wine_cellar', emoji: '🍷', i18nKey: 'universe.wine_cellar', labelFr: 'Caves à vin' },
    tourist_activity: { key: 'tourist_activity', emoji: '🎡', i18nKey: 'universe.tourist_activity', labelFr: 'Activités touristiques' },
    rooftop: { key: 'rooftop', emoji: '🌇', i18nKey: 'universe.rooftop', labelFr: 'Rooftops' },
    cultural_outing: { key: 'cultural_outing', emoji: '🎭', i18nKey: 'universe.cultural_outing', labelFr: 'Sorties culturelles' },
    nightlife: { key: 'nightlife', emoji: '🎉', i18nKey: 'universe.nightlife', labelFr: 'Lieux de sortie' },
};
const isUniverse = (v) => exports.UNIVERSES.includes(v);
exports.isUniverse = isUniverse;
