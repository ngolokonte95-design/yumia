/**
 * Les 11 moteurs IA invisibles de YUMIA (section 8 du PRD).
 * Ils n'apparaissent jamais dans l'interface : ils opèrent en arrière-plan.
 *
 * Chaque moteur déclare le « tier » de modèle dont il a besoin :
 *  - 'fast'  : latence critique, suggestions temps réel (objectif < 3 s)
 *  - 'smart' : raisonnement / assemblage de séquences cohérentes
 */
export declare const AI_ENGINES: readonly ["food", "travel", "mood", "group", "date", "family", "weather", "discovery", "memory", "experience_builder", "culture"];
export type AiEngine = (typeof AI_ENGINES)[number];
export type ModelTier = 'fast' | 'smart';
export interface AiEngineMeta {
    key: AiEngine;
    /** Déclencheur métier (résumé du PRD). */
    trigger: string;
    /** Rôle du moteur. */
    role: string;
    tier: ModelTier;
}
export declare const AI_ENGINE_META: Record<AiEngine, AiEngineMeta>;
export declare const isAiEngine: (v: string) => v is AiEngine;
