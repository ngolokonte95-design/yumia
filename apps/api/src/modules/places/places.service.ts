import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Place } from '@prisma/client';
import type { Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ElasticsearchService } from '../../infra/elasticsearch/elasticsearch.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { CreatePlaceDto } from './dto/create-place.dto';

const TRENDING_CACHE_TTL_SECONDS = 2 * 60; // 2 min — assez frais, réduit la pression DB
const PLACE_STATS_CACHE_TTL_SECONDS = 60; // 1 min — les avis communautaires sont peu fréquents
const PLACE_DETAIL_CACHE_TTL_SECONDS = 10 * 60; // 10 min — les lieux sont quasi-immuables

/** Lieu enrichi de sa distance (mètres) par rapport au point de recherche. */
export type PlaceWithDistance = Place & { distanceMeters: number };

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly es: ElasticsearchService,
    private readonly redis: RedisService,
  ) {}

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
   */
  async nearby(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<PlaceWithDistance[]> {
    if (this.es.isAvailable) {
      return this.nearbyViaEs(params);
    }
    return this.nearbyViaPg(params);
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
