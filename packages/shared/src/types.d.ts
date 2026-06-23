/**
 * DTO de domaine partagés entre l'API et le mobile (contrats stables).
 */
import type { Universe } from './universes';
import type { Mode, Mood } from './modes';
import type { AiEngine } from './ai-engines';
export interface GeoPoint {
    lat: number;
    lng: number;
}
export type PriceTier = 1 | 2 | 3 | 4;
/** Lieu (POI). PostgreSQL est la source de vérité ; indexé dans Elasticsearch. */
export interface Place {
    id: string;
    name: string;
    universe: Universe;
    location: GeoPoint;
    city: string;
    countryCode: string;
    rating: number;
    priceTier: PriceTier;
    photoUrls: string[];
    openNow?: boolean;
    /** Métadonnées exploitées par les moteurs (terrasse, kid-friendly, halal…). */
    tags: string[];
}
/** Contexte transmis à l'orchestrateur IA pour chaque requête. */
export interface AiContext {
    userId: string;
    locale: string;
    location?: GeoPoint;
    city?: string;
    countryCode?: string;
    localTimeIso?: string;
    weather?: {
        condition: string;
        tempC: number;
    };
    mode?: Mode;
    mood?: Mood;
    /** Saisie libre éventuelle (« j'ai envie de sushi ce soir »). */
    query?: string;
}
/** Une carte de suggestion (For You, Top 3). */
export interface Suggestion {
    place: Place;
    /** Score de compatibilité 0–100. */
    compatibility: number;
    distanceMeters?: number;
    /** Explication IA courte et humaine (jamais le « moteur »). */
    reason: string;
    engine: AiEngine;
}
/** Réponse Top 3 : exactement 3 options pour éliminer la paralysie du choix. */
export interface Top3Response {
    generatedAtIso: string;
    context: Pick<AiContext, 'mode' | 'mood' | 'city'>;
    suggestions: [Suggestion, Suggestion, Suggestion];
}
/** Étape d'une expérience assemblée (apéro → dîner → bar). */
export interface ExperienceStep {
    order: number;
    labelFr: string;
    place: Place;
    reason: string;
}
export interface Experience {
    id: string;
    mode: Mode;
    titleFr: string;
    steps: ExperienceStep[];
}
