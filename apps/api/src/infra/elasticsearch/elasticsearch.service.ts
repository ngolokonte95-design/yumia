import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import type { Universe } from '@yumia/shared';

export const ES_INDEX = 'yumia-places';

export interface EsPlaceDoc {
  id: string;
  name: string;
  universe: string;
  city: string | null;
  countryCode: string;
  rating: number;
  priceTier: number;
  photoUrls: string[];
  tags: string[];
  location: { lat: number; lon: number };
  createdAt: string;
}

export interface EsNearbyResult {
  id: string;
  distanceMeters: number;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('ELASTICSEARCH_URL');
    if (!url) {
      this.logger.log('Elasticsearch désactivé (ELASTICSEARCH_URL absent) — fallback PostgreSQL actif.');
      return;
    }
    try {
      this.client = new Client({ node: url });
      await this.ensureIndex();
      this.logger.log(`Elasticsearch connecté : ${url}`);
    } catch (err) {
      this.logger.warn(`Elasticsearch indisponible — fallback PostgreSQL actif. Erreur: ${(err as Error).message}`);
      this.client = null;
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  /** Retourne true si la connexion ES est opérationnelle, false si elle échoue, null si désactivée. */
  async ping(): Promise<boolean | null> {
    if (!this.client) return null;
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Indexe (ou réindexe) un lieu dans ES. */
  async indexPlace(place: {
    id: string;
    name: string;
    universe: string;
    city: string | null;
    countryCode: string;
    rating: number;
    priceTier: number;
    photoUrls: string[];
    tags: string[];
    lat: number;
    lng: number;
    createdAt: Date;
  }): Promise<void> {
    if (!this.client) return;
    const doc: EsPlaceDoc = {
      id: place.id,
      name: place.name,
      universe: place.universe,
      city: place.city,
      countryCode: place.countryCode,
      rating: place.rating,
      priceTier: place.priceTier,
      photoUrls: place.photoUrls,
      tags: place.tags,
      location: { lat: place.lat, lon: place.lng },
      createdAt: place.createdAt.toISOString(),
    };
    await this.client.index({ index: ES_INDEX, id: place.id, document: doc });
  }

  /**
   * Recherche géolocalisée par distance.
   * Retourne les IDs triés par distance croissante avec leur distance en mètres.
   */
  async geoNearby(params: {
    lat: number;
    lng: number;
    radius: number;
    universe?: Universe;
    limit: number;
  }): Promise<EsNearbyResult[]> {
    if (!this.client) return [];

    const filters: object[] = [
      {
        geo_distance: {
          distance: `${params.radius}m`,
          location: { lat: params.lat, lon: params.lng },
        },
      },
    ];
    if (params.universe) {
      filters.push({ term: { universe: params.universe } });
    }

    const response = await this.client.search<EsPlaceDoc>({
      index: ES_INDEX,
      size: params.limit,
      query: { bool: { filter: filters } },
      sort: [
        {
          _geo_distance: {
            location: { lat: params.lat, lon: params.lng },
            order: 'asc',
            unit: 'm',
          },
        },
      ],
      _source: false,
      docvalue_fields: [],
      fields: ['id'],
    });

    return response.hits.hits.map((hit) => ({
      id: hit._id!,
      distanceMeters: ((hit.sort?.[0] as number) ?? 0),
    }));
  }

  /**
   * Recherche textuelle full-text : nom + tags + univers + ville.
   * Combine un match flou sur le nom avec un filtre géographique optionnel.
   * Retourne les IDs triés par score de pertinence.
   */
  async textSearch(params: {
    query: string;
    lat?: number;
    lng?: number;
    radius?: number;     // mètres, optionnel
    universe?: Universe;
    limit: number;
  }): Promise<EsNearbyResult[]> {
    if (!this.client) return [];

    const must: object[] = [
      {
        multi_match: {
          query: params.query,
          fields: ['name^3', 'tags^2', 'city'],
          fuzziness: 'AUTO',
          operator: 'or',
        },
      },
    ];

    const filter: object[] = [];
    if (params.lat != null && params.lng != null && params.radius) {
      filter.push({
        geo_distance: {
          distance: `${params.radius}m`,
          location: { lat: params.lat, lon: params.lng },
        },
      });
    }
    if (params.universe) {
      filter.push({ term: { universe: params.universe } });
    }

    const sort: unknown[] = [{ _score: { order: 'desc' } }];
    if (params.lat != null && params.lng != null) {
      sort.push({
        _geo_distance: {
          location: { lat: params.lat, lon: params.lng },
          order: 'asc',
          unit: 'm',
        },
      });
    }

    const response = await this.client.search<EsPlaceDoc>({
      index: ES_INDEX,
      size: params.limit,
      query: { bool: { must, filter } },
      sort: sort as never,
      _source: false,
      fields: ['id'],
    });

    return response.hits.hits.map((hit) => ({
      id: hit._id!,
      distanceMeters: params.lat != null ? ((hit.sort?.[1] as number) ?? 0) : 0,
    }));
  }

  /** Supprime le document d'un lieu (utilisé lors de la suppression). */
  async deletePlace(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.delete({ index: ES_INDEX, id });
    } catch {
      // Ignorer si le document n'existe pas
    }
  }

  private async ensureIndex(): Promise<void> {
    if (!this.client) return;
    const exists = await this.client.indices.exists({ index: ES_INDEX });
    if (exists) return;

    await this.client.indices.create({
      index: ES_INDEX,
      mappings: {
        properties: {
          name: { type: 'text' },
          universe: { type: 'keyword' },
          city: { type: 'keyword' },
          countryCode: { type: 'keyword' },
          rating: { type: 'float' },
          priceTier: { type: 'integer' },
          photoUrls: { type: 'keyword', index: false },
          tags: { type: 'keyword' },
          location: { type: 'geo_point' },
          createdAt: { type: 'date' },
        },
      },
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
      },
    });
    this.logger.log(`Index ES "${ES_INDEX}" créé.`);
  }
}
