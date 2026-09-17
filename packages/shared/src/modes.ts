/**
 * Modes contextuels YUMIA. Chaque mode change la façon dont l'IA filtre et assemble
 * les suggestions (seul / couple / famille / amis / voyage / hasard).
 */

export const MODES = ['solo', 'surprise', 'date', 'family', 'group', 'travel'] as const;
export type Mode = (typeof MODES)[number];

export interface ModeMeta {
  key: Mode;
  emoji: string;
  i18nKey: string;
  labelFr: string;
  /** Le mode assemble-t-il une séquence de lieux (apéro → dîner → bar) ? */
  buildsItinerary: boolean;
  /** Le mode implique-t-il plusieurs participants ? */
  multiParticipant: boolean;
}

export const MODE_META: Record<Mode, ModeMeta> = {
  solo: { key: 'solo', emoji: '🙂', i18nKey: 'mode.solo', labelFr: 'Seul', buildsItinerary: false, multiParticipant: false },
  surprise: { key: 'surprise', emoji: '🎲', i18nKey: 'mode.surprise', labelFr: 'Surprise Me', buildsItinerary: false, multiParticipant: false },
  date: { key: 'date', emoji: '❤️', i18nKey: 'mode.date', labelFr: 'Date', buildsItinerary: true, multiParticipant: true },
  family: { key: 'family', emoji: '👨‍👩‍👧', i18nKey: 'mode.family', labelFr: 'Famille', buildsItinerary: false, multiParticipant: true },
  group: { key: 'group', emoji: '👥', i18nKey: 'mode.group', labelFr: 'Groupe', buildsItinerary: false, multiParticipant: true },
  travel: { key: 'travel', emoji: '✈️', i18nKey: 'mode.travel', labelFr: 'Travel', buildsItinerary: true, multiParticipant: false },
};

/** Filtres d'humeur du flux For You (section 5.3 du PRD). */
export const MOODS = ['hungry', 'thirsty', 'going_out', 'explore', 'relax'] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_META: Record<Mood, { emoji: string; i18nKey: string; labelFr: string }> = {
  hungry: { emoji: '🍽️', i18nKey: 'mood.hungry', labelFr: 'Faim' },
  thirsty: { emoji: '🥤', i18nKey: 'mood.thirsty', labelFr: 'Soif' },
  going_out: { emoji: '🎉', i18nKey: 'mood.going_out', labelFr: 'Sortir' },
  explore: { emoji: '🌍', i18nKey: 'mood.explore', labelFr: 'Explorer' },
  relax: { emoji: '😌', i18nKey: 'mood.relax', labelFr: 'Me détendre' },
};

/**
 * Univers que couvre chaque humeur du flux For You — un FILTRE, pas une
 * préférence.
 *
 * L'humeur n'était transmise qu'à l'IA, qui en déduisait des univers à
 * favoriser : le tirage « variété » du flux reprenait ensuite tout le reste,
 * et « Faim » proposait encore des musées et des bars. Les premiers univers de
 * chaque liste sont les plus représentatifs : ce sont eux que le serveur va
 * chercher en priorité quand la zone en manque.
 */
export const MOOD_UNIVERSES: Record<Mood, readonly string[]> = {
  hungry: ['restaurant', 'brunch', 'food_truck', 'bakery', 'dessert'],
  thirsty: ['bar', 'cafe', 'pub', 'tea_house', 'juice_bar', 'wine_cellar', 'rooftop', 'hookah'],
  going_out: [
    'nightclub', 'bar', 'live_music', 'pub', 'rooftop', 'karaoke', 'comedy_club', 'cinema',
    'theater', 'bowling', 'escape_game', 'laser_game', 'karting', 'casino', 'event_venue',
  ],
  explore: [
    'museum', 'monument', 'tourist_activity', 'park', 'photo_spot', 'cultural_outing',
    'botanical_garden', 'natural_site', 'zoo', 'amusement_park', 'beach', 'hiking',
  ],
  relax: ['park', 'spa', 'cafe', 'tea_house', 'massage', 'botanical_garden', 'beach', 'picnic_area', 'yoga_studio'],
};
