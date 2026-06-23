/**
 * Modes contextuels YUMIA. Chaque mode change la façon dont l'IA filtre et assemble
 * les suggestions (seul / couple / famille / amis / voyage / hasard).
 */
export declare const MODES: readonly ["solo", "surprise", "date", "family", "group", "travel"];
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
export declare const MODE_META: Record<Mode, ModeMeta>;
/** Filtres d'humeur du flux For You (section 5.3 du PRD). */
export declare const MOODS: readonly ["hungry", "thirsty", "going_out", "explore", "relax"];
export type Mood = (typeof MOODS)[number];
export declare const MOOD_META: Record<Mood, {
    emoji: string;
    i18nKey: string;
    labelFr: string;
}>;
