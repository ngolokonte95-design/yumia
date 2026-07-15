import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Place } from '@prisma/client';
import type { Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ElasticsearchService } from '../../infra/elasticsearch/elasticsearch.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { CreatePlaceDto } from './dto/create-place.dto';
import {
  PLACES_PROVIDER,
  type PlacesProvider,
  type ProviderPlace,
} from './providers/places-provider.interface';
import { isBlockedPlace, UNIVERSE_TEXT_QUERIES } from './providers/place-types';

const TRENDING_CACHE_TTL_SECONDS = 2 * 60; // 2 min — assez frais, réduit la pression DB
const PLACE_STATS_CACHE_TTL_SECONDS = 60; // 1 min — les avis communautaires sont peu fréquents
const PLACE_DETAIL_CACHE_TTL_SECONDS = 10 * 60; // 10 min — les lieux sont quasi-immuables

// En dessous de ce nombre de résultats locaux, on hydrate depuis le fournisseur
// externe (Google Places) pour densifier la zone. Élevé volontairement : on veut
// beaucoup de lieux par point (100+), pas seulement « au moins quelques-uns ».
const HYDRATE_MIN_LOCAL_RESULTS = 60;
// Une tuile (zone + univers) hydratée avec succès n'est pas ré-interrogée avant
// ce délai → évite de rappeler l'API (coût) pour la même zone. 7 jours.
const HYDRATE_TILE_TTL_SECONDS = 7 * 24 * 60 * 60;
// Verrou court anti-stampede pendant l'appel réseau (plusieurs requêtes
// concurrentes sur la même zone vide ne déclenchent qu'un seul appel).
const HYDRATE_LOCK_TTL_SECONDS = 60;
// Zone où le fournisseur n'a (pour l'instant) rien renvoyé : on retente après ce
// délai au lieu de la bloquer une semaine entière (couverture mondiale).
const HYDRATE_EMPTY_RETRY_TTL_SECONDS = 6 * 60 * 60; // 6 h
// URL photo (googleusercontent) résolue, mise en cache pour éviter un appel
// Google à chaque chargement d'image. 6 h.
const PHOTO_URL_CACHE_TTL_SECONDS = 6 * 60 * 60;
const PHOTO_DEFAULT_WIDTH = 800;
// Nombre max de lieux sans photo enrichis par Text Search lors d'une hydratation
// de tuile — borne le surcoût API (1 appel/lieu) tout en comblant les manques.
const PHOTO_ENRICH_BUDGET = 10;

/** Lieu enrichi de sa distance (mètres) par rapport au point de recherche. */
export type PlaceWithDistance = Place & { distanceMeters: number };

/**
 * Catégories interrogées pour densifier la carte "Tous" (aucun univers filtré).
 * Google plafonne `searchNearby` à 20 résultats/appel : en couvrant plusieurs
 * catégories, on remonte beaucoup plus de lieux variés par zone.
 */
const MAP_DENSITY_UNIVERSES: Universe[] = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'dessert',
  'ice_cream',
  'tourist_activity',
  'cultural_outing',
  'museum',
  'park',
  'photo_spot',
  'nightclub',
  'shopping',
  'bookstore',
  'cinema',
  'monument',
  'hotel',
];

const EARTH_RADIUS_M = 6_371_000;

/**
 * Accès aux lieux (POI) et recherche géolocalisée.
 *
 * La recherche « nearby » s'appuie sur PostgreSQL : pré-filtre par bounding-box
 * (indexable) puis distance exacte via Haversine. Suffisant et performant à
 * l'échelle MVP ; une bascule Elasticsearch geo est prévue pour le passage à
 * l'échelle (cf. ROADMAP — dette).
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly photoBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly es: ElasticsearchService,
    private readonly redis: RedisService,
    @Inject(PLACES_PROVIDER) private readonly provider: PlacesProvider,
    private readonly config: ConfigService,
  ) {
    this.photoBaseUrl = this.config.get<{ publicBaseUrl?: string }>('places')?.publicBaseUrl ?? '';
  }

  /** Crée un lieu et l'indexe dans Elasticsearch si disponible. */
  async create(dto: CreatePlaceDto): Promise<Place> {
    const place = await this.prisma.place.create({
      data: {
        name: dto.name,
        universe: dto.universe,
        lat: dto.lat,
        lng: dto.lng,
        city: dto.city,
        countryCode: dto.countryCode.toUpperCase(),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.priceTier !== undefined ? { priceTier: dto.priceTier } : {}),
        ...(dto.tags ? { tags: dto.tags } : {}),
        ...(dto.photoUrls ? { photoUrls: dto.photoUrls } : {}),
      },
    });
    // Fire-and-forget — ne bloque pas la réponse, ES peut être absent
    this.es.indexPlace(place).catch(() => {});
    return place;
  }

  /** Ajoute l'URL d'une photo uploadée à la liste du lieu. */
  async addPhoto(id: string, photoUrl: string): Promise<Place> {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }
    const updated = await this.prisma.place.update({
      where: { id },
      data: { photoUrls: [...place.photoUrls, photoUrl] },
    });
    void this.redis.del(`place:${id}`).catch(() => undefined);
    return updated;
  }

  /** Avis agrégés de la communauté pour un lieu (loved / neutral / disliked). */
  async placeStats(id: string): Promise<{
    loved: number;
    neutral: number;
    disliked: number;
    total: number;
  }> {
    const statsKey = `place:stats:${id}`;
    const cached = await this.redis.getJson<{ loved: number; neutral: number; disliked: number; total: number }>(statsKey).catch(() => null);
    if (cached) return cached;

    const groups = await this.prisma.visit.groupBy({
      by: ['feedback'],
      where: { placeId: id, feedback: { not: null } },
      _count: { id: true },
    });

    const counts = { loved: 0, neutral: 0, disliked: 0 };
    for (const g of groups) {
      if (g.feedback === 'loved') counts.loved = g._count.id;
      else if (g.feedback === 'neutral') counts.neutral = g._count.id;
      else if (g.feedback === 'disliked') counts.disliked = g._count.id;
    }

    const stats = { ...counts, total: counts.loved + counts.neutral + counts.disliked };
    void this.redis.setJson(statsKey, stats, PLACE_STATS_CACHE_TTL_SECONDS).catch(() => undefined);
    return stats;
  }

  /** Lieu par identifiant. */
  async findById(id: string): Promise<Place> {
    const placeKey = `place:${id}`;
    const cached = await this.redis.getJson<Place>(placeKey).catch(() => null);
    if (cached) return cached;

    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }

    void this.redis.setJson(placeKey, place, PLACE_DETAIL_CACHE_TTL_SECONDS).catch(() => undefined);
    return place;
  }

  /** Liste paginée, filtrable par ville et univers. */
  list(params: {
    city?: string;
    universe?: Universe;
    limit: number;
    offset: number;
  }): Promise<Place[]> {
    return this.prisma.place.findMany({
      where: {
        ...(params.city ? { city: { equals: params.city, mode: 'insensitive' } } : {}),
        ...(params.universe ? { universe: params.universe } : {}),
      },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: params.limit,
      skip: params.offset,
    });
  }

  /**
   * Lieux tendance — les plus visités dans un rayon donné sur les dernières 24h.
   * Renvoie au plus `limit` lieux ordonnés par nombre de visites décroissant.
   */
  async trending(params: {
    lat: number;
    lng: number;
    radius: number;
    limit: number;
    hours?: number;
  }): Promise<(PlaceWithDistance & { visitCount: number })[]> {
    const { lat, lng, radius, limit, hours = 24 } = params;

    const trendingKey = `trending:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${limit}:${hours}`;
    const cached = await this.redis.getJson<(PlaceWithDistance & { visitCount: number })[]>(trendingKey).catch(() => null);
    if (cached) return cached;

    const since = new Date(Date.now() - hours * 3_600_000);

    const latDelta = radius / 111_320;
    const lngDelta = radius / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);

    const results = await this.prisma.$queryRaw<(PlaceWithDistance & { visitCount: number })[]>(Prisma.sql`
      SELECT p.*,
        ${EARTH_RADIUS_M} * acos(
          LEAST(1, GREATEST(-1,
            cos(radians(${lat})) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(${lng})) +
            sin(radians(${lat})) * sin(radians(p.lat))
          ))
        ) AS "distanceMeters",
        COUNT(v.id)::int AS "visitCount"
      FROM "Place" p
      LEFT JOIN "Visit" v ON v."placeId" = p.id AND v."visitedAt" >= ${since}
      WHERE p.lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND p.lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
      GROUP BY p.id
      HAVING COUNT(v.id) > 0
        AND ${EARTH_RADIUS_M} * acos(
          LEAST(1, GREATEST(-1,
            cos(radians(${lat})) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(${lng})) +
            sin(radians(${lat})) * sin(radians(p.lat))
          ))
        ) <= ${radius}
      ORDER BY "visitCount" DESC, p.rating DESC
      LIMIT ${limit}
    `);

    void this.redis.setJson(trendingKey, results, TRENDING_CACHE_TTL_SECONDS).catch(() => undefined);
    return results;
  }

  /**
   * Lieux les plus proches d'un point, triés par distance croissante.
   * Utilise Elasticsearch si disponible (geo_distance), sinon PostgreSQL Haversine.
   *
   * Si la base locale est pauvre dans la zone (< {@link HYDRATE_MIN_LOCAL_RESULTS})
   * et qu'un fournisseur externe est actif, on hydrate la base à la volée
   * (couverture mondiale) puis on relit. PostgreSQL reste la source de vérité.
   */
  async nearby(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    let results = await this.queryNearby(params);

    if (this.provider.isEnabled && results.length < HYDRATE_MIN_LOCAL_RESULTS) {
      const hydrated = await this.maybeHydrate(params);
      if (hydrated) {
        // Relecture en PG : les lieux fraîchement importés y sont garantis
        // (l'indexation ES est asynchrone et peut ne pas être prête).
        results = await this.nearbyViaPg(params);
      }
    }

    return results;
  }

  private queryNearby(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    return this.es.isAvailable ? this.nearbyViaEs(params) : this.nearbyViaPg(params);
  }

  /**
   * Interroge le fournisseur externe pour la zone et persiste les lieux, au plus
   * une fois par tuile (zone arrondie + univers) et par fenêtre TTL.
   * Best-effort : toute erreur est avalée (l'app fonctionne sans hydratation).
   * @returns `true` si des lieux ont été importés (→ relecture utile).
   */
  private async maybeHydrate(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
  }): Promise<boolean> {
    const tileKey = [
      'places:hydrated',
      // Version de schéma d'hydratation : incrémenter invalide les tuiles
      // anciennes (ex. densité v1) et force une ré-hydratation plus riche.
      // v5 : déblocage des univers car_rental / car_dealership / tobacco
      // (leurs types Google étaient dans la liste bloquée → 0 lieu persisté).
      'v5',
      params.universe ?? 'all',
      params.lat.toFixed(2),
      params.lng.toFixed(2),
      Math.max(1, Math.round(params.radius / 1000)),
    ].join(':');

    const already = await this.redis.getJson<boolean>(tileKey).catch(() => null);
    if (already) return false;

    // Verrou COURT posé AVANT l'appel : évite le stampede si plusieurs requêtes
    // concurrentes ciblent la même zone vide, sans la bloquer durablement.
    await this.redis.setJson(tileKey, true, HYDRATE_LOCK_TTL_SECONDS).catch(() => undefined);

    try {
      let found: ProviderPlace[];
      if (params.universe) {
        found = await this.provider.searchNearby({
          lat: params.lat,
          lng: params.lng,
          radius: params.radius,
          universe: params.universe,
          limit: 20,
        });
      } else {
        // Carte "Tous" : Google plafonne searchNearby à 20 résultats par appel.
        // Pour densifier, on interroge plusieurs catégories clés en parallèle et
        // on fusionne (dédup par providerPlaceId dans persistProviderPlaces).
        const batches = await Promise.all(
          MAP_DENSITY_UNIVERSES.map((u) =>
            this.provider
              .searchNearby({ lat: params.lat, lng: params.lng, radius: params.radius, universe: u, limit: 20 })
              .catch(() => [] as ProviderPlace[]),
          ),
        );
        const seen = new Set<string>();
        found = batches.flat().filter((p) => {
          if (seen.has(p.providerPlaceId)) return false;
          seen.add(p.providerPlaceId);
          return true;
        });
      }
      if (found.length === 0) {
        // Rien trouvé cette fois : on retentera dans quelques heures plutôt que
        // de condamner la zone pendant une semaine (clé/quota transitoire…).
        await this.redis.setJson(tileKey, true, HYDRATE_EMPTY_RETRY_TTL_SECONDS).catch(() => undefined);
        return false;
      }
      await this.persistProviderPlaces(found);
      // Succès : on évite de rappeler l'API pour cette zone pendant 7 jours.
      await this.redis.setJson(tileKey, true, HYDRATE_TILE_TTL_SECONDS).catch(() => undefined);
      this.logger.log(`Hydratation : ${found.length} lieux importés (${tileKey}).`);
      return true;
    } catch (err) {
      this.logger.warn(`Hydratation échouée (${tileKey}) : ${(err as Error).message}`);
      // On retire le marqueur pour autoriser une nouvelle tentative plus tard.
      await this.redis.del(tileKey).catch(() => undefined);
      return false;
    }
  }

  /** Upsert (dédup par providerPlaceId) des lieux importés + réindexation ES. Retourne les lieux sauvegardés. */
  private async persistProviderPlaces(places: ProviderPlace[]): Promise<Place[]> {
    const saved: Place[] = [];
    let enrichBudget = PHOTO_ENRICH_BUDGET;
    for (const p of places) {
      // Ignore épiceries, banques, stations… (sauf univers de service) et lieux mal notés.
      if (isBlockedPlace(p.tags, p.universe)) continue;
      if (p.rating > 0 && p.rating < 3.0) continue;
      try {
        // Lieu sans photo (ex. night-club renvoyé nu par searchNearby) : on tente
        // un enrichissement Text Search par nom+position, dans un budget borné
        // pour maîtriser le coût API.
        if ((!p.photoRefs || p.photoRefs.length === 0) && enrichBudget > 0 && this.provider.findPhotoRefs) {
          enrichBudget -= 1;
          const refs = await this.provider
            .findPhotoRefs(`${p.name} ${p.city}`.trim(), p.lat, p.lng)
            .catch(() => [] as string[]);
          if (refs.length > 0) p.photoRefs = refs;
        }
        const photoUrls = this.buildPhotoUrls(p.photoRefs);
        const metadata =
          p.openingHours && p.openingHours.length > 0
            ? { source: 'google', openingHours: p.openingHours }
            : { source: 'google' };

        const place = await this.prisma.place.upsert({
          where: { providerPlaceId: p.providerPlaceId },
          create: {
            name: p.name,
            universe: p.universe as Place['universe'],
            lat: p.lat,
            lng: p.lng,
            city: p.city,
            countryCode: p.countryCode,
            rating: p.rating,
            priceTier: p.priceTier,
            tags: p.tags,
            photoUrls,
            metadata,
            provider: 'google',
            providerPlaceId: p.providerPlaceId,
            ...(p.address ? { address: p.address } : {}),
          },
          update: {
            // On met à jour l'univers : si une correspondance de type a été
            // affinée (ex. onglerie reclassée de 'spa' vers 'nail_salon'), la
            // ré-hydratation corrige le lieu déjà stocké.
            universe: p.universe as Place['universe'],
            tags: p.tags,
            rating: p.rating,
            priceTier: p.priceTier,
            metadata,
            ...(photoUrls.length > 0 ? { photoUrls } : {}),
            ...(p.address ? { address: p.address } : {}),
          },
        });
        this.es.indexPlace(place).catch(() => {});
        saved.push(place);
      } catch {
        // best-effort par lieu — un échec ne bloque pas les autres
      }
    }
    return saved;
  }

  /**
   * Recherche **géolocalisée par mot-clé libre** (ex. un plat : « couscous »,
   * « ramen »). S'appuie sur le Text Search du provider, qui cherche jusque dans
   * les avis → renvoie les lieux qui servent réellement ce plat, autour du point.
   * Persiste les nouveaux lieux puis renvoie l'ensemble trié par distance.
   *
   * Best-effort : sans provider actif, renvoie `[]` (le pipeline retombe sur la
   * recherche par univers). Cache court par (query+tuile) pour limiter le coût.
   */
  async searchByQueryNearby(params: {
    query: string;
    lat: number;
    lng: number;
    radius: number;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    const query = params.query.trim();
    if (!this.provider.isEnabled || !this.provider.searchTextNearby || query.length < 3) {
      return [];
    }

    const cacheKey = [
      'places:dish',
      query.toLowerCase().slice(0, 40),
      params.lat.toFixed(2),
      params.lng.toFixed(2),
      Math.max(1, Math.round(params.radius / 1000)),
    ].join(':');

    // Le cache stocke les IDs des lieux qui matchent le plat pour cette zone :
    // on évite ainsi de rappeler Google ET on sait exactement quels lieux
    // ressortir (ceux qui servent réellement le plat), même sur un cache hit.
    let matchedIds = await this.redis.getJson<string[]>(cacheKey).catch(() => null);

    if (matchedIds === null) {
      try {
        const found = await this.provider.searchTextNearby(
          query,
          params.lat,
          params.lng,
          params.radius,
          undefined,
          20,
        );
        const saved = found.length > 0 ? await this.persistProviderPlaces(found) : [];
        matchedIds = saved.map((p) => p.id);
        const ttl = matchedIds.length > 0 ? HYDRATE_TILE_TTL_SECONDS : HYDRATE_EMPTY_RETRY_TTL_SECONDS;
        await this.redis.setJson(cacheKey, matchedIds, ttl).catch(() => undefined);
        this.logger.log(`Recherche plat « ${query} » : ${matchedIds.length} lieux.`);
      } catch (err) {
        this.logger.warn(`Recherche plat « ${query} » échouée : ${(err as Error).message}`);
        return [];
      }
    }

    if (matchedIds.length === 0) return [];

    // Recharge les lieux matchés et calcule leur distance au point de recherche.
    const places = await this.prisma.place.findMany({ where: { id: { in: matchedIds } } });
    return places
      .map((p) => ({
        ...p,
        distanceMeters: haversineMeters(params.lat, params.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, params.limit);
  }

  /**
   * Recherche textuelle full-text par nom/tags/ville.
   * Utilise Elasticsearch si disponible, sinon ILIKE PostgreSQL.
   */
  async textSearch(params: {
    query: string;
    lat?: number;
    lng?: number;
    radius?: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    if (this.es.isAvailable) {
      const hits = await this.es.textSearch({
        query: params.query,
        lat: params.lat,
        lng: params.lng,
        radius: params.radius,
        universe: params.universe,
        limit: params.limit,
      });
      if (hits.length > 0) {
        const ids = hits.map((h) => h.id);
        const distanceMap = new Map(hits.map((h) => [h.id, h.distanceMeters]));
        const places = await this.prisma.place.findMany({ where: { id: { in: ids } } });
        return places.map((p) => ({ ...p, distanceMeters: distanceMap.get(p.id) ?? 0 }));
      }
    }

    // Fallback PostgreSQL ILIKE
    const places = await this.prisma.place.findMany({
      where: {
        OR: [
          { name: { contains: params.query, mode: 'insensitive' } },
          { city: { contains: params.query, mode: 'insensitive' } },
          { tags: { has: params.query.toLowerCase() } },
        ],
        ...(params.universe ? { universe: params.universe } : {}),
      },
      take: params.limit,
      orderBy: { rating: 'desc' },
    });

    return places.map((p) => {
      let dist = 0;
      if (params.lat != null && params.lng != null) {
        const R = 6_371_000;
        const dLat = ((p.lat - params.lat) * Math.PI) / 180;
        const dLng = ((p.lng - params.lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((params.lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      return { ...p, distanceMeters: Math.round(dist) };
    });
  }

  /**
   * Recherche de lieux par ville (sans géolocalisation). Sert d'abord les lieux
   * locaux ; si la base est pauvre et qu'un provider est actif, hydrate via
   * Text Search Google puis fusionne. Cache Redis par (ville+univers) — 7 jours.
   */
  async searchByCity(params: {
    city: string;
    universe?: Universe;
    limit: number;
  }): Promise<Place[]> {
    const local = await this.list({
      city: params.city,
      universe: params.universe,
      limit: params.limit,
      offset: 0,
    });

    if (
      local.length >= params.limit ||
      !this.provider.isEnabled ||
      !this.provider.searchByText
    ) {
      return local;
    }

    const cacheKey = `places:city:${params.city.toLowerCase()}:${params.universe ?? 'all'}`;
    const already = await this.redis.getJson<boolean>(cacheKey).catch(() => null);
    if (already) return local;
    // Verrou court pendant l'appel (anti-stampede), prolongé seulement en cas de succès.
    await this.redis.setJson(cacheKey, true, HYDRATE_LOCK_TTL_SECONDS).catch(() => undefined);

    try {
      // Pour les univers dont le type Google est invalide (cannabis, hookah…), on
      // utilise la requête textuelle dédiée + on force l'univers sur les résultats.
      // Sans ça, un coffeeshop d'Amsterdam typé `coffee_shop` par Google est reclassé
      // en `cafe` par googleTypesToUniverse et disparaît de l'univers cannabis.
      const textQuery = params.universe ? UNIVERSE_TEXT_QUERIES[params.universe] : undefined;
      const query = textQuery
        ? `${textQuery} in ${params.city}`
        : params.universe
        ? `${params.universe} in ${params.city}`
        : params.city;
      let found = await this.provider.searchByText!(query, params.universe, 20);
      if (textQuery && params.universe) {
        found = found.map((p) => ({ ...p, universe: params.universe! }));
      }
      if (found.length === 0) {
        await this.redis.setJson(cacheKey, true, HYDRATE_EMPTY_RETRY_TTL_SECONDS).catch(() => undefined);
        return local;
      }
      const saved = await this.persistProviderPlaces(found);
      await this.redis.setJson(cacheKey, true, HYDRATE_TILE_TTL_SECONDS).catch(() => undefined);
      this.logger.log(`Recherche ville « ${params.city} » : ${saved.length} lieux importés.`);
      // Fusion locale + importés, dédup par id, tri par note décroissante.
      const byId = new Map<string, Place>();
      for (const p of [...local, ...saved]) byId.set(p.id, p);
      return [...byId.values()]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, params.limit);
    } catch (err) {
      this.logger.warn(`Recherche ville « ${params.city} » échouée : ${(err as Error).message}`);
      await this.redis.del(cacheKey).catch(() => undefined);
      return local;
    }
  }

  /**
   * Construit les URL de photos pointant vers notre proxy `GET /places/photo`
   * (la clé Google reste côté serveur). Vide si l'URL publique de l'API n'est
   * pas configurée (évite des liens cassés).
   */
  private buildPhotoUrls(photoRefs?: string[]): string[] {
    if (!this.photoBaseUrl || !photoRefs || photoRefs.length === 0) return [];
    return photoRefs.map(
      (ref) =>
        `${this.photoBaseUrl}/api/places/photo?ref=${encodeURIComponent(ref)}&w=${PHOTO_DEFAULT_WIDTH}`,
    );
  }

  /**
   * Résout une référence photo en URL d'image directe (pour le proxy), avec
   * cache Redis pour éviter un appel Google à chaque affichage.
   */
  async resolvePhotoUrl(ref: string, maxWidthPx = PHOTO_DEFAULT_WIDTH): Promise<string | null> {
    if (!this.provider.resolvePhotoUrl) return null;
    const cacheKey = `gphoto:${ref}:${maxWidthPx}`;
    const cached = await this.redis.getJson<string>(cacheKey).catch(() => null);
    if (cached) return cached;

    const url = await this.provider.resolvePhotoUrl(ref, maxWidthPx).catch(() => null);
    if (url) {
      await this.redis.setJson(cacheKey, url, PHOTO_URL_CACHE_TTL_SECONDS).catch(() => undefined);
    }
    return url;
  }

  private async nearbyViaEs(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    const hits = await this.es.geoNearby(params);
    if (hits.length === 0) return [];

    const ids = hits.map((h) => h.id);
    const places = await this.prisma.place.findMany({ where: { id: { in: ids } } });

    const distanceMap = new Map(hits.map((h) => [h.id, h.distanceMeters]));
    return ids.flatMap((id) => {
      const place = places.find((p) => p.id === id);
      return place ? [{ ...place, distanceMeters: distanceMap.get(id) ?? 0 }] : [];
    });
  }

  private async nearbyViaPg(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    const { lat, lng, radius, universe, limit } = params;

    // Demi-côtés de la bounding-box (degrés) pour le pré-filtre indexable.
    const latDelta = radius / 111_320;
    const lngDelta = radius / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);

    const universeFilter = universe
      ? Prisma.sql`AND universe::text = ${universe}`
      : Prisma.empty;

    return this.prisma.$queryRaw<PlaceWithDistance[]>(Prisma.sql`
      SELECT * FROM (
        SELECT *,
          ${EARTH_RADIUS_M} * acos(
            LEAST(1, GREATEST(-1,
              cos(radians(${lat})) * cos(radians(lat)) *
              cos(radians(lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(lat))
            ))
          ) AS "distanceMeters"
        FROM "Place"
        WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
          AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
          ${universeFilter}
      ) AS ranked
      WHERE "distanceMeters" <= ${radius}
      ORDER BY "distanceMeters" ASC
      LIMIT ${limit}
    `);
  }
}

/** Distance Haversine en mètres entre deux points (lat/lng en degrés). */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
