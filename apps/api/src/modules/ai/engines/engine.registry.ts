import { AI_ENGINE_META, type AiEngine, type AiContext, type ModelTier } from '@yumia/shared';

/**
 * Définition d'un moteur IA : comment construire son prompt, quel tier de modèle
 * utiliser, et (optionnel) quel schéma JSON contraint sa sortie.
 *
 * Ajouter un moteur = ajouter une entrée ici. Les contrôleurs métier n'ont jamais
 * à connaître les prompts.
 */
export interface EngineDefinition {
  key: AiEngine;
  tier: ModelTier;
  system: string;
  buildPrompt: (ctx: AiContext) => string;
  jsonSchema?: Record<string, unknown>;
}

const SYSTEM_BASE =
  "Tu es le moteur de recommandation invisible de YUMIA, copilote mondial des expériences du quotidien. " +
  "Tu ne te présentes jamais comme une IA. Tu réponds de façon concise, chaleureuse et actionnable, " +
  "dans la langue de l'utilisateur. Tu adaptes toujours tes suggestions au contexte (heure, météo, humeur, culture locale).";

function ctxSummary(ctx: AiContext): string {
  const parts: string[] = [];
  if (ctx.city) parts.push(`ville=${ctx.city}`);
  if (ctx.localTimeIso) parts.push(`heure=${ctx.localTimeIso}`);
  if (ctx.weather) parts.push(`météo=${ctx.weather.condition} ${ctx.weather.tempC}°C`);
  if (ctx.mood) parts.push(`humeur=${ctx.mood}`);
  if (ctx.mode) parts.push(`mode=${ctx.mode}`);
  if (ctx.query) parts.push(`envie="${ctx.query}"`);
  if (ctx.locale) parts.push(`langue=${ctx.locale}`);
  if (ctx.preferences?.favoriteUniverses?.length) {
    parts.push(`univers-favoris=${ctx.preferences.favoriteUniverses.join(',')}`);
  }
  if (ctx.preferences?.restrictions?.length) {
    parts.push(`restrictions=${ctx.preferences.restrictions.join(',')}`);
  }
  return parts.join(', ');
}

/** Schéma partagé pour les moteurs qui renvoient une explication courte. */
const REASON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string' },
    universesSuggested: { type: 'array', items: { type: 'string' } },
  },
  required: ['reason', 'universesSuggested'],
};

export const ENGINE_REGISTRY: Record<AiEngine, EngineDefinition> = {
  mood: {
    key: 'mood',
    tier: AI_ENGINE_META.mood.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Interprète l'état émotionnel de l'utilisateur et propose les univers les plus adaptés maintenant. Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  food: {
    key: 'food',
    tier: AI_ENGINE_META.food.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Recommande le type de lieu food idéal selon goûts, humeur, budget et disponibilité. Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  weather: {
    key: 'weather',
    tier: AI_ENGINE_META.weather.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Ajuste les suggestions à la météo (terrasse si soleil, cosy si pluie, climatisé si canicule). Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  culture: {
    key: 'culture',
    tier: AI_ENGINE_META.culture.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Adapte les suggestions aux codes culturels locaux (halal, végétalien, sacré…). Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  family: {
    key: 'family',
    tier: AI_ENGINE_META.family.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Filtre et score les lieux selon les contraintes famille (enfants, poussette, menu enfant). Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  discovery: {
    key: 'discovery',
    tier: AI_ENGINE_META.discovery.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Sélectionne un lieu inspirant et inattendu pour le flux For You, façon découverte virale. Contexte : ${ctxSummary(ctx)}.`,
    jsonSchema: REASON_SCHEMA,
  },
  date: {
    key: 'date',
    tier: AI_ENGINE_META.date.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Construis un scénario de soirée romantique pour deux (apéritif, dîner, activité, bar). Contexte : ${ctxSummary(ctx)}.`,
  },
  group: {
    key: 'group',
    tier: AI_ENGINE_META.group.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Trouve le consensus optimal qui maximise la satisfaction collective du groupe. Contexte : ${ctxSummary(ctx)}.`,
  },
  travel: {
    key: 'travel',
    tier: AI_ENGINE_META.travel.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Génère un itinéraire de découverte hyper-local et authentique (éviter les pièges à touristes). Contexte : ${ctxSummary(ctx)}.`,
  },
  memory: {
    key: 'memory',
    tier: AI_ENGINE_META.memory.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Crée un souvenir personnalisé ou propose une revisite pertinente. Contexte : ${ctxSummary(ctx)}.`,
  },
  experience_builder: {
    key: 'experience_builder',
    tier: AI_ENGINE_META.experience_builder.tier,
    system: SYSTEM_BASE,
    buildPrompt: (ctx) =>
      `Assemble une séquence de 3 étapes (ex. apéro → dîner → bar) adaptée au mode "${ctx.mode ?? 'date'}" et au contexte : ${ctxSummary(ctx)}. ` +
      `Pour chaque étape, fournis : order (1/2/3), labelFr (libellé humain), universe (un parmi : restaurant, cafe, bakery, dessert, bar, bubble_tea, local_specialty, ice_cream, chocolatier, wine_cellar, tourist_activity, rooftop, cultural_outing, nightlife), reasonFr (1 phrase).`,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titleFr: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              order: { type: 'integer' },
              labelFr: { type: 'string' },
              universe: { type: 'string' },
              reasonFr: { type: 'string' },
            },
            required: ['order', 'labelFr', 'universe', 'reasonFr'],
          },
        },
      },
      required: ['titleFr', 'steps'],
    },
  },
};
