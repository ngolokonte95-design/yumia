/**
 * Les 11 moteurs IA invisibles de YUMIA (section 8 du PRD).
 * Ils n'apparaissent jamais dans l'interface : ils opèrent en arrière-plan.
 *
 * Chaque moteur déclare le « tier » de modèle dont il a besoin :
 *  - 'fast'  : latence critique, suggestions temps réel (objectif < 3 s)
 *  - 'smart' : raisonnement / assemblage de séquences cohérentes
 */

export const AI_ENGINES = [
  'food',
  'travel',
  'mood',
  'group',
  'date',
  'family',
  'weather',
  'discovery',
  'memory',
  'experience_builder',
  'culture',
] as const;

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

export const AI_ENGINE_META: Record<AiEngine, AiEngineMeta> = {
  food: {
    key: 'food',
    trigger: 'Catégorie food sélectionnée ou heure de repas',
    role: 'Recommande le meilleur lieu selon goûts, humeur, budget et disponibilité',
    tier: 'fast',
  },
  travel: {
    key: 'travel',
    trigger: 'Changement de ville détecté ou Travel Mode activé',
    role: 'Génère des itinéraires hyper-locaux et authentiques',
    tier: 'smart',
  },
  mood: {
    key: 'mood',
    trigger: 'Heure, météo, historique récent, saisie utilisateur',
    role: "Interprète l'état émotionnel et filtre les suggestions",
    tier: 'fast',
  },
  group: {
    key: 'group',
    trigger: 'Group Mode activé avec plusieurs membres',
    role: 'Analyse les préférences multiples et trouve le consensus optimal',
    tier: 'smart',
  },
  date: {
    key: 'date',
    trigger: 'Date Mode activé',
    role: 'Construit des scénarios de soirée romantique adaptés au couple',
    tier: 'smart',
  },
  family: {
    key: 'family',
    trigger: "Family Mode ou profil avec enfants",
    role: 'Filtre et score les lieux selon les contraintes famille',
    tier: 'fast',
  },
  weather: {
    key: 'weather',
    trigger: 'Météo temps réel de la localisation',
    role: 'Ajuste les suggestions (terrasse, cosy, climatisé)',
    tier: 'fast',
  },
  discovery: {
    key: 'discovery',
    trigger: 'For You feed ou Surprise Me',
    role: 'Algorithme de contenu viral type TikTok — apprentissage continu',
    tier: 'fast',
  },
  memory: {
    key: 'memory',
    trigger: 'Retour dans un lieu visité ou date anniversaire',
    role: 'Crée des souvenirs, déclenche les Memories, propose des revisites',
    tier: 'smart',
  },
  experience_builder: {
    key: 'experience_builder',
    trigger: "Demande d'itinéraire ou de soirée complète",
    role: 'Assemble des séquences cohérentes (apéro → dîner → bar)',
    tier: 'smart',
  },
  culture: {
    key: 'culture',
    trigger: 'Détection du pays / langue / culture',
    role: 'Adapte les contenus aux codes culturels locaux',
    tier: 'fast',
  },
};

export const isAiEngine = (v: string): v is AiEngine => (AI_ENGINES as readonly string[]).includes(v);
