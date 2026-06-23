"use strict";
/**
 * Modes contextuels YUMIA. Chaque mode change la façon dont l'IA filtre et assemble
 * les suggestions (seul / couple / famille / amis / voyage / hasard).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOOD_META = exports.MOODS = exports.MODE_META = exports.MODES = void 0;
exports.MODES = ['solo', 'surprise', 'date', 'family', 'group', 'travel'];
exports.MODE_META = {
    solo: { key: 'solo', emoji: '🙂', i18nKey: 'mode.solo', labelFr: 'Seul', buildsItinerary: false, multiParticipant: false },
    surprise: { key: 'surprise', emoji: '🎲', i18nKey: 'mode.surprise', labelFr: 'Surprise Me', buildsItinerary: false, multiParticipant: false },
    date: { key: 'date', emoji: '❤️', i18nKey: 'mode.date', labelFr: 'Date', buildsItinerary: true, multiParticipant: true },
    family: { key: 'family', emoji: '👨‍👩‍👧', i18nKey: 'mode.family', labelFr: 'Famille', buildsItinerary: false, multiParticipant: true },
    group: { key: 'group', emoji: '👥', i18nKey: 'mode.group', labelFr: 'Groupe', buildsItinerary: false, multiParticipant: true },
    travel: { key: 'travel', emoji: '✈️', i18nKey: 'mode.travel', labelFr: 'Travel', buildsItinerary: true, multiParticipant: false },
};
/** Filtres d'humeur du flux For You (section 5.3 du PRD). */
exports.MOODS = ['hungry', 'thirsty', 'going_out', 'explore', 'relax'];
exports.MOOD_META = {
    hungry: { emoji: '🍽️', i18nKey: 'mood.hungry', labelFr: 'Faim' },
    thirsty: { emoji: '🥤', i18nKey: 'mood.thirsty', labelFr: 'Soif' },
    going_out: { emoji: '🎉', i18nKey: 'mood.going_out', labelFr: 'Sortir' },
    explore: { emoji: '🌍', i18nKey: 'mood.explore', labelFr: 'Explorer' },
    relax: { emoji: '😌', i18nKey: 'mood.relax', labelFr: 'Me détendre' },
};
