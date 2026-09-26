import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Place } from '@prisma/client';
import type { Plan, Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ElasticsearchService } from '../../infra/elasticsearch/elasticsearch.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { CreatePlaceDto } from './dto/create-place.dto';
import {
  PLACES_PROVIDER,
  type PhotoAttribution,
  type PlacesProvider,
  type ProviderPhotos,
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
// ce délai → évite de rappeler l'API (coût) pour la même zone.
//
// 30 jours, et non 7 : une zone qui a déjà rendu 60+ lieux n'en gagne presque
// rien à être re-interrogée chaque semaine, alors que chaque interrogation est
// facturée. Ce que ce délai retarde, ce sont les établissements qui viennent
// d'ouvrir — et la propagation d'un correctif de classement.
//
// Ce dernier point serait gênant sans la version de clé juste en dessous :
// passer 'v6' à 'v7' invalide toutes les tuiles du monde d'un coup. C'est elle
// qui rend un délai long sans danger, pas la longueur du délai.
const HYDRATE_TILE_TTL_SECONDS = 30 * 24 * 60 * 60;
// Verrou court anti-stampede pendant l'appel réseau (plusieurs requêtes
// concurrentes sur la même zone vide ne déclenchent qu'un seul appel).
const HYDRATE_LOCK_TTL_SECONDS = 60;
// Zone où le fournisseur n'a rien (ou presque) renvoyé. C'était 6 h : un
// univers rare dans une zone rurale était re-payé quatre fois par jour, pour
// une réponse qui ne change pas en quelques heures. Une vraie panne Google ne
// passe pas par ici (l'erreur retire la clé, la zone est retentée tout de
// suite) : ce délai ne s'applique qu'à une réponse vide mais valide.
const HYDRATE_EMPTY_RETRY_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours

/**
 * Appels Google qu'un même demandeur peut déclencher par jour (UTC).
 *
 * Ce n'est pas un quota d'affichage : une zone déjà chargée est servie depuis
 * la base, sans appel, et ne consomme rien. Seules les zones NEUVES coûtent.
 * Un utilisateur normal n'approche jamais ces chiffres ; ils arrêtent un script
 * ou une réinstallation en boucle qui balaierait la carte zone par zone. Budget
 * épuisé : on continue de servir la base, sans erreur, jusqu'au lendemain.
 * Sans compte (anciennes versions de l'app, appels directs), compté par IP,
 * plus large car plusieurs abonnés mobiles partagent souvent une IP.
 */
const HYDRATION_CALLS_PER_DAY: Record<Plan | 'anonymous', number> = {
  anonymous: 200,
  free: 60,
  plus: 100,
  gold: 150,
  diamond: 250,
};

/** Qui déclenche la recherche — pour le budget d'appels Google ci-dessus. */
export interface PlacesRequester {
  userId?: string;
  ip?: string;
}
// Un lieu dont le renouvellement de photos a échoué n'est pas réessayé avant
// ce délai : sans lui, chaque affichage de sa fiche relancerait une recherche
// facturée pour le même résultat vide.
const PHOTO_REFRESH_RETRY_TTL_SECONDS = 24 * 60 * 60; // 24 h
// URL photo (googleusercontent) résolue. Chaque résolution est FACTURÉE par
// Google ; charger l'image derrière l'URL, elle, ne l'est pas.
//
// Ces URLs expirent au bout d'un délai que Google ne documente pas (constaté :
// moins de 6 h). Un cache fixe de 15 min les jetait donc bien avant leur fin,
// et refacturait chaque photo à chaque nouveau téléphone qui l'affichait.
// Désormais on garde l'URL tant qu'elle répond : au-delà de
// PHOTO_URL_RECHECK_SECONDS, on la sonde (requête gratuite d'un octet) et on
// ne repaie une résolution que si Google l'a vraiment invalidée.
const PHOTO_URL_KEEP_SECONDS = 30 * 24 * 60 * 60;
const PHOTO_URL_RECHECK_SECONDS = 15 * 60;
const PHOTO_PROBE_TIMEOUT_MS = 3_000;
// Horaires d'un lieu, redemandés à Google au plus une fois par mois et par lieu.
const OPENING_HOURS_TTL_SECONDS = 30 * 24 * 60 * 60;
// Échec d'un appel d'horaires : pas de nouvel essai pour ce lieu avant 6 h.
const HOURS_RETRY_TTL_SECONDS = 6 * 60 * 60;
// Lieu sans aucune photo chez Google : inutile de redemander avant longtemps.
const PHOTO_MISSING_RETRY_TTL_SECONDS = 30 * 24 * 60 * 60;
const PHOTO_DEFAULT_WIDTH = 800;
// Nombre de lieux persistés EN PARALLÈLE lors d'une hydratation. Avant, ils
// étaient traités un par un (for...await) : avec le filtre "Tous les univers"
// (jusqu'à ~340 lieux importés d'un coup), ça pouvait bloquer un tap sur la
// carte plusieurs secondes, sur iPhone ET Android (le goulot est ici, côté
// serveur, pas dans le rendu mobile). Une valeur modérée garde un pic de
// charge DB/réseau raisonnable sur le VPS (~1 Go de RAM).
const PERSIST_CONCURRENCY = 10;

/** Lieu enrichi de sa distance (mètres) par rapport au point de recherche. */
export type PlaceWithDistance = Place & { distanceMeters: number };

/**
 * Catégories interrogées pour densifier la carte "Tous" (aucun univers filtré).
 * Google plafonne `searchNearby` à 20 résultats/appel : en couvrant plusieurs
 * catégories, on remonte beaucoup plus de lieux variés par zone.
 */
// Cinq catégories (c'était huit, et dix-sept avant) : chacune est une recherche
// Google facturée à chaque nouvelle zone ouverte en « Tous », le plus gros
// multiplicateur de coût de l'app. Les autres (musée, parc, shopping, cinéma…)
// se chargent quand l'utilisateur choisit leur univers, et remplissent alors
// aussi la carte « Tous » de la zone, puisque tout va dans la même base.
const MAP_DENSITY_UNIVERSES: Universe[] = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'tourist_activity',
];

const EARTH_RADIUS_M = 6_371_000;

/**
 * Tailles de zone d'hydratation, en km. Le rayon demandé suit le zoom de la
 * carte (2, 3, 5, 8 km…) : l'arrondir au kilomètre faisait de chaque niveau de
 * zoom une zone distincte, et le même quartier était payé quatre fois. On
 * ramène tout rayon à la taille fixe immédiatement supérieure, et la grille des
 * centres s'élargit avec elle pour qu'un léger déplacement ne compte pas comme
 * une nouvelle zone.
 */
const HYDRATION_ZONES: { radiusKm: number; gridDeg: number }[] = [
  { radiusKm: 1, gridDeg: 0.01 },
  { radiusKm: 3, gridDeg: 0.02 },
  { radiusKm: 10, gridDeg: 0.05 },
  { radiusKm: 20, gridDeg: 0.1 },
  { radiusKm: 50, gridDeg: 0.2 },
];

export function hydrationTile(
  lat: number,
  lng: number,
  radiusM: number,
): { lat: number; lng: number; radiusKm: number } {
  const zone =
    HYDRATION_ZONES.find((z) => radiusM <= z.radiusKm * 1000) ??
    HYDRATION_ZONES[HYDRATION_ZONES.length - 1];
  const snap = (v: number) => Math.round(v / zone.gridDeg) * zone.gridDeg;
  return { lat: snap(lat), lng: snap(lng), radiusKm: zone.radiusKm };
}

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

    const found = await this.prisma.place.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Lieu introuvable.');
    }
    const place = found.photoUrls.length > 0 ? found : await this.enrichMissingPhotos(found);

    void this.redis.setJson(placeKey, place, PLACE_DETAIL_CACHE_TTL_SECONDS).catch(() => undefined);
    return place;
  }

  /**
   * Ce que la fiche d'un lieu charge à son ouverture : photos (cherchées si le
   * lieu n'en a pas), horaires (demandés à Google si absents ou vieux de plus
   * de 30 jours) et note des utilisateurs. La fiche s'affiche d'abord avec ce
   * que la liste connaissait déjà, puis se complète.
   */
  async details(id: string): Promise<PlaceDetailsResult> {
    const found = await this.prisma.place.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Lieu introuvable.');

    const [place, reviewCount] = await Promise.all([
      found.photoUrls.length > 0 ? found : this.enrichMissingPhotos(found),
      this.prisma.placeReview.count({ where: { placeId: id } }),
    ]);
    const openingHours = await this.openingHoursOf(place);
    // Attributions exigées par les CGU Google Maps Platform : « Google » pour
    // les données et photos issues de Places, et l'auteur de chaque photo.
    const known = placeMeta(place).photoAttributions ?? {};
    const refs = place.photoUrls.map(photoRefOf);
    return {
      photoUrls: place.photoUrls,
      openingHours,
      rating: place.rating,
      reviewCount,
      googleAttribution: place.provider === 'google' || refs.some((r) => r !== null),
      photoAttributions: refs.map((r) => (r ? known[r] ?? null : null)),
    };
  }

  private async openingHoursOf(place: Place): Promise<string[]> {
    const raw = place.metadata;
    const meta = ((typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {}) as {
      openingHours?: string[];
      hoursFetchedAt?: number;
    };
    const known = meta.openingHours ?? [];
    // Horaires importés avant ce changement, sans date : on les garde tels quels
    // plutôt que de repayer un appel pour chacun des lieux déjà en base.
    const fresh = meta.hoursFetchedAt
      ? Date.now() - meta.hoursFetchedAt < OPENING_HOURS_TTL_SECONDS * 1000
      : known.length > 0;
    if (fresh || !place.providerPlaceId || !this.provider.isEnabled || !this.provider.fetchOpeningHours) {
      return known;
    }

    // Verrou : deux ouvertures simultanées de la même fiche ne paient qu'un appel.
    const lockKey = `places:hours:${place.id}`;
    const locked = await this.redis.getJson<boolean>(lockKey).catch(() => null);
    if (locked) return known;
    await this.redis.setJson(lockKey, true, HOURS_RETRY_TTL_SECONDS).catch(() => undefined);

    const hours = await this.provider.fetchOpeningHours(place.providerPlaceId).catch(() => null);
    if (hours === null) return known;
    await this.prisma.place
      .update({
        where: { id: place.id },
        data: { metadata: { ...meta, source: 'google', openingHours: hours, hoursFetchedAt: Date.now() } },
      })
      .catch(() => undefined);
    void this.redis.del(`place:${place.id}`).catch(() => undefined);
    return hours;
  }

  /**
   * Cherche les photos d'un lieu qui n'en a aucune — à l'ouverture de sa
   * fiche seulement, là où la photo se voit vraiment. Une recherche facturée
   * par lieu ouvert, au lieu de dix par zone chargée. L'échec est retenu
   * 30 jours : Google n'aura pas davantage de photo demain.
   */
  private async enrichMissingPhotos(place: Place): Promise<Place> {
    if (!this.provider.isEnabled || !this.provider.findPhotoRefs) return place;
    const guardKey = `gphoto:missing:${place.id}`;
    const tried = await this.redis.getJson<boolean>(guardKey).catch(() => null);
    if (tried) return place;
    await this.redis.setJson(guardKey, true, PHOTO_MISSING_RETRY_TTL_SECONDS).catch(() => undefined);

    const { refs, attributions } = await this.findPhotosFor(place);
    if (refs.length === 0) return place;
    return this.prisma.place
      .update({
        where: { id: place.id },
        data: { photoUrls: this.buildPhotoUrls(refs), metadata: withPhotoAttributions(place, attributions) },
      })
      .catch(() => place);
  }

  /** Photos d'un lieu (références + auteurs), par nom + position. */
  private async findPhotosFor(place: Place): Promise<ProviderPhotos> {
    const query = `${place.name} ${place.city}`.trim();
    const empty: ProviderPhotos = { refs: [], attributions: {} };
    if (this.provider.findPhotos) {
      return this.provider.findPhotos(query, place.lat, place.lng).catch(() => empty);
    }
    if (!this.provider.findPhotoRefs) return empty;
    const refs = await this.provider.findPhotoRefs(query, place.lat, place.lng).catch(() => [] as string[]);
    return { refs, attributions: {} };
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
    /** Absent pour les appels internes (recommandations…), déjà quotés ailleurs. */
    requester?: PlacesRequester;
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

    // Trop peu de résultats même après hydratation → on tente un rayon élargi
    // (ex. univers de niche : rooftop, nightclub, laser_game…). On ne touche
    // pas le résultat du PG initial : l'appel élargi enrichit juste la DB et
    // on relit dans le rayon original pour rester géographiquement cohérent.
    if (this.provider.isEnabled && results.length < 5 && params.radius < 20_000) {
      const wider = { ...params, radius: 20_000 };
      const hydrated = await this.maybeHydrate(wider);
      if (hydrated) {
        results = await this.nearbyViaPg(params); // rayon original, DB enrichie
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
    requester?: PlacesRequester;
  }): Promise<boolean> {
    const tile = hydrationTile(params.lat, params.lng, params.radius);
    const tileKey = [
      'places:hydrated',
      // Version de schéma d'hydratation : incrémenter invalide les tuiles
      // anciennes (ex. densité v1) et force une ré-hydratation plus riche.
      // v6 : filtre rating abaissé 3.0 → 2.5 pour densifier les univers peu fournis
      'v6',
      params.universe ?? 'all',
      tile.lat.toFixed(2),
      tile.lng.toFixed(2),
      tile.radiusKm,
    ].join(':');
    // La recherche Google porte sur la zone normalisée, pas sur le cercle exact
    // demandé : c'est elle que la clé ci-dessus déclare « déjà chargée ».
    const zone = { lat: tile.lat, lng: tile.lng, radius: tile.radiusKm * 1000 };

    const already = await this.redis.getJson<boolean>(tileKey).catch(() => null);
    if (already) return false;

    const cost = params.universe ? 1 : MAP_DENSITY_UNIVERSES.length;
    if (params.requester && !(await this.takeHydrationBudget(params.requester, cost))) return false;

    // Verrou COURT posé AVANT l'appel : évite le stampede si plusieurs requêtes
    // concurrentes ciblent la même zone vide, sans la bloquer durablement.
    await this.redis.setJson(tileKey, true, HYDRATE_LOCK_TTL_SECONDS).catch(() => undefined);

    try {
      let found: ProviderPlace[];
      if (params.universe) {
        found = await this.provider.searchNearby({ ...zone, universe: params.universe, limit: 20 });
      } else {
        // Carte "Tous" : Google plafonne searchNearby à 20 résultats par appel.
        // Pour densifier, on interroge plusieurs catégories clés en parallèle et
        // on fusionne (dédup par providerPlaceId dans persistProviderPlaces).
        let failures = 0;
        const batches = await Promise.all(
          MAP_DENSITY_UNIVERSES.map((u) =>
            this.provider
              .searchNearby({ ...zone, universe: u, limit: 20 })
              .catch(() => { failures += 1; return [] as ProviderPlace[]; }),
          ),
        );
        // Toutes les recherches en échec = panne, pas zone vide : sans ça, la
        // zone serait marquée vide pour sept jours (voir le catch plus bas,
        // qui retire la clé pour retenter).
        if (failures === MAP_DENSITY_UNIVERSES.length) {
          throw new Error('toutes les recherches de densité ont échoué');
        }
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
      // Peu de résultats (< 5) : délai « zone vide » plutôt que 30 jours — la
      // couverture Google peut s'améliorer.
      const ttl = found.length < 5 ? HYDRATE_EMPTY_RETRY_TTL_SECONDS : HYDRATE_TILE_TTL_SECONDS;
      await this.redis.setJson(tileKey, true, ttl).catch(() => undefined);
      this.logger.log(`Hydratation : ${found.length} lieux importés (${tileKey}, ttl=${ttl}s).`);
      return true;
    } catch (err) {
      this.logger.warn(`Hydratation échouée (${tileKey}) : ${(err as Error).message}`);
      // On retire le marqueur pour autoriser une nouvelle tentative plus tard.
      await this.redis.del(tileKey).catch(() => undefined);
      return false;
    }
  }

  /**
   * Réserve `cost` appels Google sur le budget du jour du demandeur. `false` si
   * le budget est épuisé. Redis indisponible : on laisse passer, comme les
   * quotas, plutôt que de priver tout le monde de nouvelles zones.
   */
  private async takeHydrationBudget(requester: PlacesRequester, cost: number): Promise<boolean> {
    const who = requester.userId ? `u:${requester.userId}` : `ip:${requester.ip ?? 'unknown'}`;
    const day = new Date().toISOString().slice(0, 10);
    const key = `places:hydrate-budget:${who}:${day}`;
    try {
      let limit = HYDRATION_CALLS_PER_DAY.anonymous;
      if (requester.userId) {
        const user = await this.prisma.user
          .findUnique({ where: { id: requester.userId }, select: { plan: true } })
          .catch(() => null);
        limit = HYDRATION_CALLS_PER_DAY[(user?.plan ?? 'free') as Plan] ?? HYDRATION_CALLS_PER_DAY.free;
      }
      const used = Number((await this.redis.raw.get(key)) ?? 0);
      if (used + cost > limit) {
        this.logger.warn(`Budget Google du jour atteint (${who}, ${used}/${limit}) : zone neuve non chargée.`);
        return false;
      }
      const next = await this.redis.raw.incrby(key, cost);
      if (next === cost) await this.redis.raw.expire(key, 26 * 3600);
      return true;
    } catch {
      return true;
    }
  }

  /** Upsert (dédup par providerPlaceId) des lieux importés + réindexation ES. Retourne les lieux sauvegardés. */
  private async persistProviderPlaces(places: ProviderPlace[]): Promise<Place[]> {
    const saved: Place[] = [];

    const persistOne = async (p: ProviderPlace): Promise<void> => {
      // Ignore épiceries, banques, stations… (sauf univers de service). Le
      // filtre sur la note Google a disparu avec elle : on ne la demande plus.
      if (isBlockedPlace(p.tags, p.universe)) return;
      try {
        // Un lieu importé sans photo n'est PAS enrichi ici : c'était jusqu'à
        // 10 recherches facturées par zone, pour des lieux que personne
        // n'ouvrirait peut-être jamais. Voir `enrichMissingPhotos`, appelé à
        // l'ouverture de la fiche.
        const photoUrls = this.buildPhotoUrls(p.photoRefs);

        const place = await this.prisma.place.upsert({
          where: { providerPlaceId: p.providerPlaceId },
          create: {
            name: p.name,
            universe: p.universe as Place['universe'],
            lat: p.lat,
            lng: p.lng,
            city: p.city,
            countryCode: p.countryCode,
            // Note : celle des utilisateurs de YUMIA, aucune tant que personne
            // n'a noté (voir ReviewsService). Prix : plus affiché.
            rating: 0,
            tags: p.tags,
            photoUrls,
            metadata: {
              source: 'google',
              ...(p.photoAttributions ? { photoAttributions: p.photoAttributions } : {}),
            } as unknown as Prisma.InputJsonValue,
            provider: 'google',
            providerPlaceId: p.providerPlaceId,
            ...(p.address ? { address: p.address } : {}),
          },
          update: {
            // On met à jour l'univers : si une correspondance de type a été
            // affinée (ex. onglerie reclassée de 'spa' vers 'nail_salon'), la
            // ré-hydratation corrige le lieu déjà stocké.
            // Ni note ni métadonnées : la note vient des avis YUMIA et les
            // horaires sont chargés à l'ouverture de la fiche — une
            // ré-hydratation de la zone les effacerait.
            universe: p.universe as Place['universe'],
            tags: p.tags,
            ...(photoUrls.length > 0 ? { photoUrls } : {}),
            ...(p.address ? { address: p.address } : {}),
          },
        });
        // Lieu déjà en base (la mise à jour ne touche pas aux métadonnées, qui
        // portent aussi les horaires) : on y ajoute les auteurs des photos
        // qu'il ne connaissait pas encore.
        const known = placeMeta(place).photoAttributions ?? {};
        const missing = Object.keys(p.photoAttributions ?? {}).some((ref) => !known[ref]);
        const final = missing
          ? await this.prisma.place
            .update({ where: { id: place.id }, data: { metadata: withPhotoAttributions(place, p.photoAttributions ?? {}) } })
            .catch(() => place)
          : place;
        this.es.indexPlace(final).catch(() => {});
        saved.push(final);
      } catch {
        // best-effort par lieu — un échec ne bloque pas les autres
      }
    };

    // Pool de workers à concurrence bornée : avant, ces lieux étaient persistés
    // un par un (for...await), ce qui pouvait bloquer un tap sur la carte
    // plusieurs secondes avec le filtre "Tous" (jusqu'à ~340 lieux importés
    // d'un coup). On les traite maintenant par lots concurrents.
    let cursor = 0;
    const worker = async () => {
      while (cursor < places.length) {
        const p = places[cursor];
        cursor += 1;
        await persistOne(p);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PERSIST_CONCURRENCY, places.length) }, () => worker()),
    );

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
      const queries = textQuery
        ? (Array.isArray(textQuery) ? textQuery : [textQuery]).map((q) => `${q} in ${params.city}`)
        : [params.universe ? `${params.universe} in ${params.city}` : params.city];
      const byProviderId = new Map<string, ProviderPlace>();
      for (const results of await Promise.all(queries.map((q) => this.provider.searchByText!(q, params.universe, 20)))) {
        for (const p of results) byProviderId.set(p.providerPlaceId, p);
      }
      let found = [...byProviderId.values()];
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
   * Retrouve un lieu par son NOM dans une ville — et l'importe si besoin.
   *
   * Sert les moments d'un itinéraire, où l'IA désigne des endroits précis
   * (« Real Alcázar », « Cascade El Limón ») qui n'ont aucune raison d'être
   * déjà en base. On regarde d'abord localement, puis on demande au
   * fournisseur, et on persiste ce qu'on trouve.
   *
   * Appelé À LA DEMANDE, au clic de l'utilisateur, et non à la génération :
   * un itinéraire d'une semaine compte une vingtaine de moments, dont il
   * n'en consultera que quelques-uns. Chaque recherche chez le fournisseur
   * étant facturée, les résoudre toutes d'avance reviendrait à payer vingt
   * fois pour deux consultations.
   *
   * Le résultat négatif est mis en cache : sans cela, un nom introuvable
   * relancerait une recherche payante à chaque appui.
   */
  async findOrImportByName(params: {
    name: string;
    city: string;
    universe?: Universe;
  }): Promise<Place | null> {
    const name = params.name.trim();
    if (name.length < 3) return null;

    const local = await this.prisma.place.findFirst({
      where: {
        name: { contains: name, mode: 'insensitive' },
        ...(params.city ? { city: { contains: params.city, mode: 'insensitive' } } : {}),
      },
      orderBy: { rating: 'desc' },
    });
    if (local) return local;

    if (!this.provider.isEnabled || !this.provider.searchByText) return null;

    const cacheKey = `places:byname:${params.city.toLowerCase()}:${name.toLowerCase()}`;
    const missed = await this.redis.getJson<boolean>(cacheKey).catch(() => null);
    if (missed) return null;

    try {
      const found = await this.provider.searchByText(`${name} ${params.city}`, params.universe, 5);
      if (found.length === 0) {
        await this.redis.setJson(cacheKey, true, HYDRATE_EMPTY_RETRY_TTL_SECONDS).catch(() => undefined);
        return null;
      }
      const saved = await this.persistProviderPlaces(found);
      // Le fournisseur classe par pertinence : son premier résultat pour
      // « <nom> <ville> » est le bon dans l'immense majorité des cas.
      const best = saved[0] ?? null;
      if (best) this.logger.log(`Lieu « ${name} » (${params.city}) importé à la demande.`);
      return best;
    } catch (err) {
      this.logger.warn(`Résolution de « ${name} » échouée : ${(err as Error).message}`);
      return null;
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
    // Une carte affiche des dizaines de photos d'un coup, souvent les mêmes
    // chez plusieurs utilisateurs : sans ce partage, dix demandes simultanées
    // d'une photo expirée paieraient dix résolutions au lieu d'une.
    const pending = this.photoInFlight.get(cacheKey);
    if (pending) return pending;
    const task = this.resolvePhotoUrlOnce(ref, maxWidthPx, cacheKey).finally(() =>
      this.photoInFlight.delete(cacheKey),
    );
    this.photoInFlight.set(cacheKey, task);
    return task;
  }

  private readonly photoInFlight = new Map<string, Promise<string | null>>();

  private async resolvePhotoUrlOnce(ref: string, maxWidthPx: number, cacheKey: string): Promise<string | null> {
    // Anciennes entrées : une simple chaîne, sans date de vérification.
    const cached = await this.redis
      .getJson<{ url: string; checkedAt: number } | string>(cacheKey)
      .catch(() => null);
    const entry = typeof cached === 'string' ? { url: cached, checkedAt: 0 } : cached;
    if (entry) {
      if (Date.now() - entry.checkedAt < PHOTO_URL_RECHECK_SECONDS * 1000) return entry.url;
      const alive = await probePhotoUrl(entry.url);
      // Réseau indisponible : on garde l'URL plutôt que de repayer à l'aveugle.
      if (alive !== false) {
        await this.redis
          .setJson(cacheKey, { url: entry.url, checkedAt: Date.now() }, PHOTO_URL_KEEP_SECONDS)
          .catch(() => undefined);
        return entry.url;
      }
    }

    const url = await this.provider.resolvePhotoUrl!(ref, maxWidthPx).catch(() => null);
    if (url) {
      await this.redis
        .setJson(cacheKey, { url, checkedAt: Date.now() }, PHOTO_URL_KEEP_SECONDS)
        .catch(() => undefined);
      return url;
    }

    // Référence refusée : Google borne la validité d'un nom de photo dans le
    // temps, et les lieux importés il y a des mois portent des références
    // devenues invalides (constaté : 400 sur les anciennes, 302 sur une
    // fraîche). Plutôt que de rendre une carte sans image, on redemande ses
    // photos au lieu et on met la base à jour — une fois, puis c'est réglé.
    return this.refreshStalePhoto(ref, maxWidthPx);
  }

  /**
   * Renouvelle les références photo d'un lieu dont une référence est périmée.
   *
   * Coûte UNE recherche textuelle par lieu concerné, payée une seule fois
   * puisque les nouvelles références sont persistées. Un échec est mis en
   * cache négatif : sans cela, un lieu dont Google n'a aucune photo relancerait
   * une recherche à chaque affichage de sa fiche.
   */
  private async refreshStalePhoto(ref: string, maxWidthPx: number): Promise<string | null> {
    if (!this.provider.findPhotoRefs || !this.provider.resolvePhotoUrl) return null;

    // Le nom d'une photo porte l'identifiant du lieu : « places/<id>/photos/… ».
    const providerPlaceId = ref.split('/')[1];
    if (!providerPlaceId) return null;

    const guardKey = `gphoto:refresh:${providerPlaceId}`;
    const tried = await this.redis.getJson<boolean>(guardKey).catch(() => null);
    if (tried) return null;
    await this.redis.setJson(guardKey, true, PHOTO_REFRESH_RETRY_TTL_SECONDS).catch(() => undefined);

    const place = await this.prisma.place
      .findUnique({ where: { providerPlaceId } })
      .catch(() => null);
    if (!place) return null;

    const { refs, attributions } = await this.findPhotosFor(place);
    if (refs.length === 0) return null;

    await this.prisma.place
      .update({
        where: { id: place.id },
        data: { photoUrls: this.buildPhotoUrls(refs), metadata: withPhotoAttributions(place, attributions) },
      })
      .catch(() => undefined);
    this.logger.log(`Photos renouvelées pour « ${place.name} » (${place.city}).`);

    const url = await this.provider.resolvePhotoUrl(refs[0], maxWidthPx).catch(() => null);
    if (url) {
      await this.redis
        .setJson(`gphoto:${refs[0]}:${maxWidthPx}`, { url, checkedAt: Date.now() }, PHOTO_URL_KEEP_SECONDS)
        .catch(() => undefined);
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

/**
 * Vérifie qu'une URL d'image Google répond encore, en ne demandant qu'un
 * octet. Ne coûte rien : seule la résolution d'une référence est facturée,
 * pas le téléchargement de l'image.
 *
 * @returns `true` vivante, `false` expirée (4xx), `null` indéterminé (réseau).
 */
async function probePhotoUrl(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(PHOTO_PROBE_TIMEOUT_MS),
    });
    void res.body?.cancel().catch(() => undefined);
    if (res.ok) return true;
    return res.status >= 400 && res.status < 500 ? false : null;
  } catch {
    return null;
  }
}

/** Réponse de `GET /places/:id/details`. */
export interface PlaceDetailsResult {
  photoUrls: string[];
  openingHours: string[];
  rating: number;
  reviewCount: number;
  /** Données ou photos issues de Google Maps : afficher « Google » (CGU). */
  googleAttribution: boolean;
  /** Auteur de chaque photo de `photoUrls` (même ordre), `null` si inconnu. */
  photoAttributions: (PhotoAttribution | null)[];
}

interface PlaceMeta {
  photoAttributions?: Record<string, PhotoAttribution>;
  [key: string]: unknown;
}

function placeMeta(place: Pick<Place, 'metadata'>): PlaceMeta {
  const raw = place.metadata;
  try {
    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as PlaceMeta) : {};
  } catch {
    return {};
  }
}

/** Métadonnées du lieu complétées des auteurs de photos (sans perdre le reste). */
function withPhotoAttributions(
  place: Pick<Place, 'metadata'>,
  attributions: Record<string, PhotoAttribution>,
): Prisma.InputJsonValue {
  const meta = placeMeta(place);
  if (Object.keys(attributions).length === 0) return meta as unknown as Prisma.InputJsonValue;
  return { ...meta, photoAttributions: { ...(meta.photoAttributions ?? {}), ...attributions } } as unknown as Prisma.InputJsonValue;
}

/** Référence Google d'une URL de notre proxy photo (`…/places/photo?ref=…`), sinon `null`. */
function photoRefOf(url: string): string | null {
  const m = /[?&]ref=([^&]+)/.exec(url);
  if (!m || !url.includes('/places/photo')) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
