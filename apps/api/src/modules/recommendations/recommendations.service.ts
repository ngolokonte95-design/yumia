import { Injectable, Logger } from '@nestjs/common';
import type { Place as PrismaPlace } from '@prisma/client';
import {
  DEFAULT_LOCALE,
  UNIVERSE_META,
  isUniverse,
  type AiContext,
  type AiEngine,
  type Mode,
  type Place,
  type PriceTier,
  type Suggestion,
  type Universe,
} from '@yumia/shared';
import { AiService } from '../ai/ai.service';
import { PlacesService, type PlaceWithDistance } from '../places/places.service';
import { RedisService } from '../../infra/redis/redis.service';

const TOP3_CACHE_TTL_SECONDS = 5 * 60; // 5 min
const EXPERIENCE_CACHE_TTL_SECONDS = 10 * 60; // 10 min (plus stable que le top3)

/** Plan brut renvoyé par le moteur `experience_builder`. */
interface ExperiencePlan {
  titleFr: string;
  steps: Array<{ order: number; labelFr: string; universe: string; reasonFr: string }>;
}

/** Une étape assemblée dans l'itinéraire final. */
export interface ExperienceStep {
  order: number;
  labelFr: string;
  place: Place;
  reason: string;
}

/** Itinéraire complet (Date / Travel). */
export interface ExperienceResult {
  titleFr: string;
  mode: Mode;
  generatedAtIso: string;
  steps: ExperienceStep[];
}

// Étapes de repli par mode (utilisées quand le mock provider renvoie steps=[]).
const EXPERIENCE_FALLBACKS: Record<
  string,
  Array<{ order: number; labelFr: string; universe: Universe; reasonFr: string }>
> = {
  date: [
    { order: 1, labelFr: "L'apéro", universe: 'bar', reasonFr: 'Pour bien commencer la soirée.' },
    { order: 2, labelFr: 'Le dîner', universe: 'restaurant', reasonFr: 'Un dîner aux chandelles.' },
    { order: 3, labelFr: 'Pour finir', universe: 'rooftop', reasonFr: 'Une vue pour clore la soirée.' },
  ],
  travel: [
    { order: 1, labelFr: 'Découverte', universe: 'cultural_outing', reasonFr: "Imprègne-toi de la culture locale." },
    { order: 2, labelFr: 'Pause café', universe: 'cafe', reasonFr: 'Un café comme un local.' },
    { order: 3, labelFr: 'Spécialité locale', universe: 'local_specialty', reasonFr: 'La cuisine du terroir.' },
  ],
  default: [
    { order: 1, labelFr: 'Pour commencer', universe: 'cafe', reasonFr: 'Un bon point de départ.' },
    { order: 2, labelFr: 'Le principal', universe: 'restaurant', reasonFr: 'Un moment en bonne compagnie.' },
    { order: 3, labelFr: 'Pour terminer', universe: 'bar', reasonFr: 'En finir en beauté.' },
  ],
};

/** Sortie de l'orchestrateur Top 3 (jusqu'à 3 lieux réels, contextualisés). */
export interface Top3Result {
  generatedAtIso: string;
  context: Pick<AiContext, 'mode' | 'mood' | 'city'>;
  /** Explication contextuelle globale (issue du moteur IA). */
  reason: string;
  suggestions: Suggestion[];
}

/** Sortie attendue du moteur `mood`. */
interface MoodOutput {
  reason: string;
  universesSuggested: string[];
}

// Pondérations du score de compatibilité (somme = 1).
// L'univers domine : quand l'IA identifie le bon type (resto pour "couscous"),
// il doit l'emporter sur une statue proche mais hors-sujet. Note et distance
// départagent ensuite les lieux du bon univers.
const W_UNIVERSE = 0.55;
const W_RATING = 0.2;
const W_DISTANCE = 0.25;

// Vitesse de marche moyenne (m/min) pour estimer le temps de trajet.
const WALK_M_PER_MIN = 80;

// Univers à exclure selon les restrictions (clés normalisées en minuscules).
const RESTRICTION_EXCLUDED: Record<string, Universe[]> = {
  'sans alcool': ['bar', 'wine_cellar', 'nightlife'],
};

/**
 * Univers "destination volontaire" — on y va sur décision, jamais en suggestion
 * spontanée. Exclus du Top 3 / recherche / feed pour éviter qu'une église ou un
 * magasin bien noté et proche ne prenne la place d'un vrai lieu de sortie/food.
 * Ils restent accessibles via la grille d'univers (`/universe?u=...`).
 */
const RECO_EXCLUDED_UNIVERSES = new Set<string>([
  // Beauté & Services personnels
  'place_of_worship',
  'spa',
  'fitness',
  'florist',
  'library',
  'nail_salon',
  'hair_salon',
  'barber',
  'massage',
  // Shopping (on ne recommande pas de magasin comme expérience du soir)
  'shopping',
  'mall',
  'jewelry',
  // Sport & Loisirs fonctionnels (recherche intentionnelle, pas reco)
  'padel',
  'karting',
  'laser_game',
  // Services / infrastructures
  'coworking',
  'gare',
  'hotel',
  'event_venue',
  // Valeurs héritées supprimées de l'UI
  'cheese_shop',
  'nightlife',
  'art_gallery',
]);

/**
 * Orchestrateur du **Top 3 contextuel** — le « Aha moment » de YUMIA.
 *
 * Pipeline : le moteur IA `mood` interprète le contexte et propose des univers ;
 * on récupère les lieux réels proches via `PlacesService`, on les score
 * (univers suggéré × note × distance), et on renvoie les 3 meilleurs.
 *
 * Dégradation propre : si l'IA ne suggère aucun univers (ex. provider mock sans
 * clé), le score d'univers devient neutre et le classement repose sur la note et
 * la distance — la fonctionnalité reste pleinement utilisable.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly ai: AiService,
    private readonly places: PlacesService,
    private readonly redis: RedisService,
  ) {}

  /** Délègue un message utilisateur à l'IA avec un system prompt de contexte lieu. */
  chatAboutPlace(system: string, userMessage: string): Promise<string> {
    return this.ai.freeChat(system, userMessage);
  }

  async top3(input: {
    lat: number;
    lng: number;
    radius: number;
    city?: string;
    mode?: AiContext['mode'];
    mood?: AiContext['mood'];
    query?: string;
    localTimeIso?: string;
    locale?: string;
    favoriteUniverses?: Universe[];
    restrictions?: string[];
    weather?: AiContext['weather'];
    maxPriceTier?: number;
  }): Promise<Top3Result> {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const ctx: AiContext = {
      userId: 'anonymous',
      locale,
      location: { lat: input.lat, lng: input.lng },
      city: input.city,
      localTimeIso: input.localTimeIso ?? new Date().toISOString(),
      mode: input.mode,
      mood: input.mood,
      query: input.query,
      weather: input.weather,
      preferences: {
        favoriteUniverses: input.favoriteUniverses,
        restrictions: input.restrictions,
      },
    };

    // Cache Redis : clé basée sur position (arrondie à ~200 m), rayon, mode, mood
    // ET la query — sinon deux recherches différentes au même endroit (ex.
    // "couscous" vs "boire un verre") renverraient le même résultat mis en cache.
    const cacheKey = [
      'reco:top3',
      input.lat.toFixed(2),
      input.lng.toFixed(2),
      input.radius,
      input.mode ?? '',
      input.mood ?? '',
      (input.query ?? '').toLowerCase().trim().slice(0, 60),
      locale,
    ].join(':');

    const cached = await this.redis.getJson<Top3Result>(cacheKey).catch(() => null);
    if (cached) {
      this.logger.debug('Top 3 servi depuis le cache Redis');
      return cached;
    }

    let { reason, suggestions } = await this.rank(ctx, input.radius, 3, 'mood');
    if (input.maxPriceTier != null) {
      suggestions = suggestions.filter(
        (s) => s.place.priceTier <= (input.maxPriceTier as number),
      );
    }
    this.logger.debug(`Top 3 généré : ${suggestions.length} lieux`);

    const result: Top3Result = {
      generatedAtIso: new Date().toISOString(),
      context: { mode: input.mode, mood: input.mood, city: input.city },
      reason: reason || defaultReason(locale),
      suggestions,
    };

    // Mise en cache non-bloquante (on ne attend pas + on ignore les erreurs Redis)
    void this.redis.setJson(cacheKey, result, TOP3_CACHE_TTL_SECONDS).catch(() => undefined);

    return result;
  }

  /**
   * Flux **For You** — liste inspirante et variée de lieux réels (façon feed),
   * mood-aware. Même pipeline que le Top 3, mais davantage d'items.
   */
  async feed(input: {
    lat: number;
    lng: number;
    radius: number;
    mood?: AiContext['mood'];
    locale?: string;
    limit: number;
    favoriteUniverses?: Universe[];
    restrictions?: string[];
    weather?: AiContext['weather'];
  }): Promise<Top3Result> {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const ctx: AiContext = {
      userId: 'anonymous',
      locale,
      location: { lat: input.lat, lng: input.lng },
      localTimeIso: new Date().toISOString(),
      mood: input.mood,
      weather: input.weather,
      preferences: {
        favoriteUniverses: input.favoriteUniverses,
        restrictions: input.restrictions,
      },
    };

    // PAS de cache Redis sur le feed : chaque appel (ouverture, pull-to-refresh,
    // "load more") doit renvoyer un échantillon frais. Le client déduplique déjà
    // par id et garde son propre cache offline (useFeed). Caché → on verrait
    // toujours les 20 mêmes lieux et "load more" n'ajouterait rien.
    const { reason, suggestions } = await this.rank(ctx, input.radius, input.limit, 'discovery');
    this.logger.debug(`Feed généré : ${suggestions.length} lieux (mood: ${input.mood ?? '∅'})`);

    return {
      generatedAtIso: new Date().toISOString(),
      context: { mode: undefined, mood: input.mood, city: undefined },
      reason: reason || defaultReason(locale),
      suggestions,
    };
  }

  /**
   * Construit un itinéraire en 3 étapes (Date / Travel).
   * L'IA choisit les univers les plus adaptés au mode, puis on sélectionne
   * le meilleur lieu réel de chaque univers dans le rayon donné.
   */
  async buildExperience(input: {
    lat: number;
    lng: number;
    radius: number;
    mode: Mode;
    locale?: string;
    favoriteUniverses?: Universe[];
    restrictions?: string[];
  }): Promise<ExperienceResult> {
    const locale = input.locale ?? DEFAULT_LOCALE;

    const expCacheKey = [
      'reco:experience',
      input.lat.toFixed(2),
      input.lng.toFixed(2),
      input.radius,
      input.mode,
      locale,
    ].join(':');

    const cachedExp = await this.redis.getJson<ExperienceResult>(expCacheKey).catch(() => null);
    if (cachedExp) {
      this.logger.debug('Experience servie depuis le cache Redis');
      return cachedExp;
    }

    const ctx: AiContext = {
      userId: 'anonymous',
      locale,
      location: { lat: input.lat, lng: input.lng },
      localTimeIso: new Date().toISOString(),
      mode: input.mode,
      preferences: {
        favoriteUniverses: input.favoriteUniverses,
        restrictions: input.restrictions,
      },
    };

    const plan = await this.ai.runStructured<ExperiencePlan>('experience_builder', ctx);

    const rawSteps =
      plan.steps.length > 0
        ? plan.steps
        : (EXPERIENCE_FALLBACKS[input.mode] ?? EXPERIENCE_FALLBACKS['default']);

    const allNearby = await this.places.nearby({
      lat: input.lat,
      lng: input.lng,
      radius: input.radius,
      limit: 100,
    });

    const usedIds = new Set<string>();
    const steps: ExperienceStep[] = rawSteps
      .filter((s) => isUniverse(s.universe))
      .map((s) => {
        const candidates = allNearby
          .filter((p) => p.universe === s.universe && !usedIds.has(p.id))
          .sort((a, b) => b.rating - a.rating);
        const best = candidates[0];
        if (!best) return null;
        usedIds.add(best.id);
        return {
          order: s.order,
          labelFr: s.labelFr,
          place: toDomainPlace(best),
          reason: s.reasonFr || this.buildReason(best),
        };
      })
      .filter((s): s is ExperienceStep => s !== null);

    const defaultTitle = input.mode === 'date' ? 'Soirée en amoureux' : 'Votre itinéraire';
    this.logger.debug(`Experience générée : ${steps.length} étapes (mode: ${input.mode})`);

    const expResult: ExperienceResult = {
      titleFr: plan.titleFr || defaultTitle,
      mode: input.mode,
      generatedAtIso: new Date().toISOString(),
      steps,
    };

    void this.redis.setJson(expCacheKey, expResult, EXPERIENCE_CACHE_TTL_SECONDS).catch(() => undefined);
    return expResult;
  }

  /**
   * Sélectionne le moteur IA le plus adapté au contexte.
   * Priorité : culture (restrictions) > weather (météo extrême) > food (query/profil food) > mood.
   */
  private selectEngine(ctx: AiContext): AiEngine {
    // Restrictions culturelles / alimentaires → moteur culture
    if (ctx.preferences?.restrictions?.length) return 'culture';

    // Météo extrême → moteur weather
    if (ctx.weather) {
      const { tempC, condition } = ctx.weather;
      const cond = condition.toLowerCase();
      if (tempC >= 28 || tempC <= 6 || cond.includes('rain') || cond.includes('snow') || cond.includes('pluie') || cond.includes('neige')) {
        return 'weather';
      }
    }

    // Query contenant un plat/boisson/envie food → moteur food
    if (ctx.query) {
      const q = ctx.query.toLowerCase();
      const FOOD_KEYWORDS = [
        'manger', 'dîner', 'déjeuner', 'petit-déj', 'brunch', 'repas', 'plat', 'cuisine',
        'restaurant', 'boire', 'verre', 'café', 'café', 'bière', 'cocktail', 'vin',
        'couscous', 'pizza', 'burger', 'sushi', 'tacos', 'pasta', 'salade', 'dessert',
        'gâteau', 'glace', 'chocolat', 'pâtisserie', 'brochette', 'kebab', 'ramen',
        'noodle', 'curry', 'crêpe', 'raclette', 'fondue', 'steak', 'poisson', 'fruits de mer',
        'tapas', 'sushi', 'dim sum', 'banh mi', 'fallafel', 'falafel', 'hummus',
        'thé', 'smoothie', 'jus', 'latte', 'cappuccino', 'expresso',
      ];
      if (FOOD_KEYWORDS.some((kw) => q.includes(kw))) return 'food';
    }

    // Profil majoritairement food → moteur food
    const FOOD_UNIVERSES = new Set<Universe>([
      'restaurant', 'cafe', 'bakery', 'dessert', 'bar',
      'bubble_tea', 'ice_cream', 'chocolatier', 'wine_cellar',
    ]);
    const favs = ctx.preferences?.favoriteUniverses ?? [];
    if (favs.length >= 3) {
      const foodCount = favs.filter((u) => FOOD_UNIVERSES.has(u)).length;
      if (foodCount / favs.length >= 0.6) return 'food';
    }

    return 'mood';
  }

  /**
   * Cœur commun : l'IA propose des univers selon le contexte, on récupère les
   * lieux réels proches, on les score et on renvoie les `limit` meilleurs.
   */
  private async rank(
    ctx: AiContext,
    radius: number,
    limit: number,
    engine: Suggestion['engine'],
  ): Promise<{ reason: string; suggestions: Suggestion[] }> {
    const selectedEngine = this.selectEngine(ctx);
    this.logger.debug(`Moteur sélectionné : ${selectedEngine}`);

    // Dégradation gracieuse : si l'IA est indisponible (timeout, panne), on
    // continue sans universes suggérés — le scoring repose alors sur note + distance.
    let mood: MoodOutput;
    try {
      mood = await this.ai.runStructured<MoodOutput>(selectedEngine, ctx);
    } catch (err) {
      this.logger.warn(`IA indisponible, dégradation gracieuse : ${err instanceof Error ? err.message : String(err)}`);
      mood = { reason: '', universesSuggested: [] };
    }

    const suggestedUniverses = mood.universesSuggested.filter(isUniverse);
    const favoriteUniverses = (ctx.preferences?.favoriteUniverses ?? []) as Universe[];
    const restrictions = ctx.preferences?.restrictions ?? [];

    const raw = await this.places.nearby({
      lat: ctx.location!.lat,
      lng: ctx.location!.lng,
      radius,
      limit: Math.max(40, limit * 3),
    });

    // Recherche par plat : si l'utilisateur tape un mot-clé (« couscous »,
    // « ramen »…), on interroge le Text Search géolocalisé, qui remonte les lieux
    // servant réellement ce plat (match jusque dans les avis). Ces lieux sont
    // fortement priorisés — c'est LA réponse à la requête.
    const query = (ctx.query ?? '').trim();
    let dishMatches: PlaceWithDistance[] = [];
    let dishMatchIds = new Set<string>();
    if (query.length >= 3) {
      dishMatches = await this.places
        .searchByQueryNearby({
          query,
          lat: ctx.location!.lat,
          lng: ctx.location!.lng,
          radius,
          limit: Math.max(20, limit * 3),
        })
        .catch(() => []);
      dishMatchIds = new Set(dishMatches.map((p) => p.id));
    }

    // Exclut les univers "destination volontaire" (culte, magasins, spa…) des
    // suggestions spontanées : une église proche et bien notée ne doit jamais
    // sortir pour une envie de couscous. Les matchs de plat échappent à ce filtre
    // (lieux food explicitement demandés).
    const recommendable = raw.filter(
      (p) => dishMatchIds.has(p.id) || !RECO_EXCLUDED_UNIVERSES.has(p.universe as string),
    );

    // Fusionne les matchs de plat dans le pool (dédup par id), puis applique les
    // restrictions alimentaires (ex. « sans alcool ») à l'ensemble.
    const byId = new Map<string, PlaceWithDistance>();
    for (const p of [...dishMatches, ...recommendable]) byId.set(p.id, p);
    const candidates = this.filterByRestrictions([...byId.values()], restrictions);

    const scored = candidates.map((place) => {
      const base = this.scoreOf(place, radius, suggestedUniverses, favoriteUniverses);
      // Boost fort pour un lieu qui sert le plat demandé : il doit dominer un
      // resto générique proche mais hors-sujet.
      const compatibility = dishMatchIds.has(place.id) ? Math.min(100, base + 35) : base;
      return { place, compatibility };
    });

    // Variété : on ne prend PAS strictement le top-N (qui serait toujours
    // identique → effet "toujours les mêmes suggestions"), mais un échantillon
    // aléatoire pondéré par le score, dans un pool de qualité. Le feed pioche
    // large (découverte), le Top 3 dans un pool resserré (qualité).
    const poolSize = engine === 'discovery' ? Math.max(limit * 3, 24) : Math.max(limit * 3, 12);
    const picked = this.diversifiedPick(scored, limit, poolSize);

    const suggestions: Suggestion[] = picked.map(({ place, compatibility }) => ({
      place: toDomainPlace(place),
      compatibility,
      distanceMeters: Math.round(place.distanceMeters),
      reason: this.buildReason(place),
      engine,
    }));

    return { reason: mood.reason, suggestions };
  }

  /**
   * Sélection diversifiée : échantillonnage aléatoire pondéré par le score, sans
   * remise, depuis les `poolSize` meilleurs candidats. Garantit de la variété
   * entre deux générations tout en privilégiant les lieux les mieux adaptés.
   */
  private diversifiedPick<T extends { compatibility: number }>(
    scored: T[],
    limit: number,
    poolSize: number,
  ): T[] {
    const sorted = [...scored].sort((a, b) => b.compatibility - a.compatibility);
    const pool = sorted.slice(0, Math.max(limit, Math.min(sorted.length, poolSize)));
    const available = [...pool];
    const chosen: T[] = [];
    while (chosen.length < limit && available.length > 0) {
      // Poids = score² → favorise nettement les meilleurs sans jamais les imposer.
      const weights = available.map((c) => Math.pow(Math.max(1, c.compatibility), 2));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let idx = 0;
      while (idx < weights.length - 1 && (r -= weights[idx]) > 0) idx++;
      chosen.push(available[idx]);
      available.splice(idx, 1);
    }
    return chosen.sort((a, b) => b.compatibility - a.compatibility);
  }

  /** Exclut les lieux dont l'univers est incompatible avec une restriction. */
  private filterByRestrictions(
    candidates: PlaceWithDistance[],
    restrictions: string[],
  ): PlaceWithDistance[] {
    if (restrictions.length === 0) return candidates;
    const excluded = new Set<Universe>();
    for (const r of restrictions) {
      const exclusions = RESTRICTION_EXCLUDED[r.toLowerCase()];
      if (exclusions) exclusions.forEach((u) => excluded.add(u));
    }
    return excluded.size === 0
      ? candidates
      : candidates.filter((p) => !excluded.has(p.universe as Universe));
  }

  /**
   * Score de compatibilité 0–100.
   * Blend : signal IA (mood engine) × préférences utilisateur × note × proximité.
   * - Si l'IA et les préférences convergent → score maximum.
   * - Si seules les préférences → elles guident intégralement le score d'univers.
   * - Si ni l'un ni l'autre → score neutre 0.5.
   */
  private scoreOf(
    place: PlaceWithDistance,
    radius: number,
    suggestedUniverses: Universe[],
    favoriteUniverses: Universe[],
  ): number {
    const ratingScore = place.rating / 5;
    const distanceScore = 1 - Math.min(place.distanceMeters / radius, 1);

    const aiRank = suggestedUniverses.indexOf(place.universe as Universe);
    const aiScore =
      suggestedUniverses.length === 0
        ? null
        : aiRank === -1
          ? 0.05
          : 1 - (aiRank / suggestedUniverses.length) * 0.5;

    const prefScore =
      favoriteUniverses.length === 0
        ? null
        : favoriteUniverses.includes(place.universe as Universe)
          ? 1
          : 0.2;

    const universeScore =
      aiScore === null && prefScore === null
        ? 0.5
        : aiScore === null
          ? prefScore!
          : prefScore === null
            ? aiScore
            : aiScore * 0.6 + prefScore * 0.4;

    const score =
      W_UNIVERSE * universeScore + W_RATING * ratingScore + W_DISTANCE * distanceScore;
    return Math.round(score * 100);
  }

  /** Explication courte, humaine et déterministe par lieu. */
  private buildReason(place: PlaceWithDistance): string {
    const meta = UNIVERSE_META[place.universe as Universe];
    const walkMin = Math.max(1, Math.round(place.distanceMeters / WALK_M_PER_MIN));
    const quality =
      place.rating >= 4.6
        ? 'coup de cœur du quartier'
        : place.rating >= 4.2
          ? 'très bien noté'
          : 'à découvrir';
    return `${meta.emoji} ${meta.labelFr} à ${walkMin} min — ${quality}.`;
  }
}

/** Mappe un lieu Prisma vers la forme de domaine partagée (`@yumia/shared`). */
function toDomainPlace(p: PrismaPlace): Place {
  return {
    id: p.id,
    name: p.name,
    universe: p.universe as Universe,
    location: { lat: p.lat, lng: p.lng },
    city: p.city,
    countryCode: p.countryCode,
    rating: p.rating,
    priceTier: Math.min(4, Math.max(1, p.priceTier)) as PriceTier,
    photoUrls: p.photoUrls,
    tags: p.tags,
  };
}

function defaultReason(locale: string): string {
  return locale.startsWith('en')
    ? 'Here are three spots that fit your moment.'
    : 'Voici trois adresses qui collent à ton moment.';
}
