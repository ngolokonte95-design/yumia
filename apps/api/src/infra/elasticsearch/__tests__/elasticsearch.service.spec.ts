import { ConfigService } from '@nestjs/config';
import { ElasticsearchService, ES_INDEX } from '../elasticsearch.service';

// ── Mock ES client ────────────────────────────────────────────────────────────

function makeClient() {
  return {
    ping: jest.fn().mockResolvedValue(true),
    index: jest.fn().mockResolvedValue({ result: 'created' }),
    search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
    indices: {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

const makePlace = () => ({
  id: 'place-1',
  name: 'Le Bistrot',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/p.jpg'],
  tags: ['terrasse'],
  lat: 48.856,
  lng: 2.352,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

function makeService(client: ReturnType<typeof makeClient> | null): ElasticsearchService {
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const service = new ElasticsearchService(config);
  (service as unknown as { client: typeof client }).client = client;
  return service;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ElasticsearchService', () => {
  // ── disabled (pas de client) ───────────────────────────────────────────────

  describe('mode désactivé (fallback PostgreSQL)', () => {
    it('isAvailable est false', () => {
      expect(makeService(null).isAvailable).toBe(false);
    });

    it('ping retourne null', async () => {
      expect(await makeService(null).ping()).toBeNull();
    });

    it('geoNearby retourne un tableau vide sans requête', async () => {
      const result = await makeService(null).geoNearby({ lat: 0, lng: 0, radius: 1000, limit: 5 });
      expect(result).toEqual([]);
    });

    it('indexPlace ne lève pas et ne fait rien', async () => {
      await expect(makeService(null).indexPlace(makePlace())).resolves.toBeUndefined();
    });

    it('deletePlace ne lève pas et ne fait rien', async () => {
      await expect(makeService(null).deletePlace('place-1')).resolves.toBeUndefined();
    });
  });

  // ── available (client présent) ──────────────────────────────────────────────

  describe('mode actif', () => {
    let client: ReturnType<typeof makeClient>;
    let service: ElasticsearchService;

    beforeEach(() => {
      client = makeClient();
      service = makeService(client);
    });

    it('isAvailable est true', () => {
      expect(service.isAvailable).toBe(true);
    });

    it('ping retourne true quand ES répond', async () => {
      expect(await service.ping()).toBe(true);
    });

    it('ping retourne false quand ES échoue', async () => {
      client.ping.mockRejectedValue(new Error('timeout'));
      expect(await service.ping()).toBe(false);
    });

    it('indexPlace construit le document avec location lat/lon et createdAt ISO', async () => {
      await service.indexPlace(makePlace());

      expect(client.index).toHaveBeenCalledWith({
        index: ES_INDEX,
        id: 'place-1',
        document: expect.objectContaining({
          id: 'place-1',
          location: { lat: 48.856, lon: 2.352 },
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      });
    });

    it('geoNearby construit un filtre geo_distance et mappe les hits', async () => {
      client.search.mockResolvedValue({
        hits: { hits: [{ _id: 'place-1', sort: [320] }, { _id: 'place-2', sort: [890] }] },
      });

      const result = await service.geoNearby({ lat: 48.856, lng: 2.352, radius: 2000, limit: 10 });

      expect(result).toEqual([
        { id: 'place-1', distanceMeters: 320 },
        { id: 'place-2', distanceMeters: 890 },
      ]);
      const query = client.search.mock.calls[0][0];
      expect(query.query.bool.filter[0]).toMatchObject({
        geo_distance: { distance: '2000m', location: { lat: 48.856, lon: 2.352 } },
      });
    });

    it('geoNearby ajoute un filtre term universe quand fourni', async () => {
      await service.geoNearby({ lat: 48.856, lng: 2.352, radius: 2000, universe: 'bar', limit: 10 });

      const query = client.search.mock.calls[0][0];
      expect(query.query.bool.filter).toContainEqual({ term: { universe: 'bar' } });
    });

    it('geoNearby n\'ajoute pas de filtre universe quand absent', async () => {
      await service.geoNearby({ lat: 48.856, lng: 2.352, radius: 2000, limit: 10 });

      const query = client.search.mock.calls[0][0];
      expect(query.query.bool.filter).toHaveLength(1);
    });

    it('geoNearby met distanceMeters à 0 quand sort est absent', async () => {
      client.search.mockResolvedValue({ hits: { hits: [{ _id: 'place-x' }] } });

      const result = await service.geoNearby({ lat: 0, lng: 0, radius: 1000, limit: 5 });

      expect(result).toEqual([{ id: 'place-x', distanceMeters: 0 }]);
    });

    it('deletePlace supprime le document', async () => {
      await service.deletePlace('place-1');

      expect(client.delete).toHaveBeenCalledWith({ index: ES_INDEX, id: 'place-1' });
    });

    it('deletePlace swallow l\'erreur si le document n\'existe pas', async () => {
      client.delete.mockRejectedValue(new Error('not_found'));

      await expect(service.deletePlace('absent')).resolves.toBeUndefined();
    });
  });
});
