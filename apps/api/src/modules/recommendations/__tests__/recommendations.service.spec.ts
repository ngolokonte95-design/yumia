import { Test } from '@nestjs/testing';
import { RecommendationsService } from '../recommendations.service';
import { AiService } from '../../ai/ai.service';
import { PlacesService } from '../../places/places.service';
import { RedisService } from '../../../infra/redis/redis.service';

const mockPlace = (overrides: Partial<any> = {}) => ({
  id: 'place-1',
  name: 'Le Bistrot',
  universe: 'restaurant',
  lat: 48.856,
  lng: 2.352,
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/photo.jpg'],
  tags: ['terrasse', 'bistronomique'],
  metadata: {},
  distanceMeters: 500,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const aiMock = {
  runStructured: jest.fn(),
  freeChat: jest.fn(),
};

const placesMock = {
  nearby: jest.fn(),
};

const redisMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
};

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: AiService, useValue: aiMock },
        { provide: PlacesService, useValue: placesMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    jest.clearAllMocks();
  });

  describe('top3', () => {
    it('retourne jusqu\'à 3 suggestions enrichies', async () => {
      aiMock.runStructured.mockResolvedValue({
        reason: 'Soirée idéale',
        universesSuggested: ['restaurant', 'bar'],
      });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p1', universe: 'restaurant', rating: 4.8, distanceMeters: 200 }),
        mockPlace({ id: 'p2', universe: 'bar', rating: 4.2, distanceMeters: 800 }),
        mockPlace({ id: 'p3', universe: 'cafe', rating: 4.0, distanceMeters: 300 }),
        mockPlace({ id: 'p4', universe: 'restaurant', rating: 4.5, distanceMeters: 400 }),
      ]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000 });

      expect(result.suggestions).toHaveLength(3);
      expect(result.generatedAtIso).toBeDefined();
      expect(result.reason).toBe('Soirée idéale');
      result.suggestions.forEach((s) => {
        expect(s.compatibility).toBeGreaterThanOrEqual(0);
        expect(s.compatibility).toBeLessThanOrEqual(100);
        expect(s.distanceMeters).toBeGreaterThanOrEqual(0);
      });
    });

    it('trie par score de compatibilité décroissant', async () => {
      aiMock.runStructured.mockResolvedValue({
        reason: '',
        universesSuggested: ['restaurant'],
      });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p-loin', universe: 'restaurant', rating: 4.9, distanceMeters: 2900 }),
        mockPlace({ id: 'p-proche', universe: 'restaurant', rating: 4.9, distanceMeters: 100 }),
      ]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000 });

      expect(result.suggestions[0].distanceMeters).toBeLessThan(result.suggestions[1]?.distanceMeters ?? Infinity);
    });

    it('filtre les lieux dépassant maxPriceTier', async () => {
      aiMock.runStructured.mockResolvedValue({
        reason: '',
        universesSuggested: ['restaurant'],
      });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'cheap', universe: 'restaurant', priceTier: 1, distanceMeters: 100 }),
        mockPlace({ id: 'expensive', universe: 'restaurant', priceTier: 4, distanceMeters: 200 }),
      ]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000, maxPriceTier: 2 });

      expect(result.suggestions.every((s) => s.place.priceTier <= 2)).toBe(true);
      expect(result.suggestions.find((s) => s.place.id === 'expensive')).toBeUndefined();
    });

    it('fonctionne quand l\'IA renvoie 0 univers suggérés (dégradation propre)', async () => {
      aiMock.runStructured.mockResolvedValue({ reason: '', universesSuggested: [] });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p1', rating: 4.5 }),
        mockPlace({ id: 'p2', rating: 4.0 }),
      ]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000 });

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('renvoie un tableau vide si aucun lieu disponible', async () => {
      aiMock.runStructured.mockResolvedValue({ reason: '', universesSuggested: ['restaurant'] });
      placesMock.nearby.mockResolvedValue([]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000 });

      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('feed', () => {
    it('génère le feed via l\'IA et le met en cache', async () => {
      aiMock.runStructured.mockResolvedValue({ reason: 'Découverte du jour', universesSuggested: ['cafe'] });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p1', universe: 'cafe', rating: 4.7, distanceMeters: 300 }),
        mockPlace({ id: 'p2', universe: 'restaurant', rating: 4.5, distanceMeters: 600 }),
      ]);

      const result = await service.feed({ lat: 48.856, lng: 2.352, radius: 3000, limit: 10 });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(redisMock.setJson).toHaveBeenCalledTimes(1);
      expect(redisMock.setJson).toHaveBeenCalledWith(
        expect.stringContaining('reco:feed'),
        expect.objectContaining({ suggestions: expect.any(Array) }),
        300,
      );
    });

    it('renvoie le résultat depuis le cache Redis sans appeler l\'IA', async () => {
      const cachedFeed = {
        generatedAtIso: new Date().toISOString(),
        context: { mode: undefined, mood: undefined, city: undefined },
        reason: 'Depuis le cache',
        suggestions: [],
      };
      redisMock.getJson.mockResolvedValueOnce(cachedFeed);

      const result = await service.feed({ lat: 48.856, lng: 2.352, radius: 3000, limit: 10 });

      expect(result.reason).toBe('Depuis le cache');
      expect(aiMock.runStructured).not.toHaveBeenCalled();
    });
  });

  describe('buildExperience', () => {
    it('renvoie le résultat depuis le cache Redis sans appeler l\'IA', async () => {
      const cachedExp = {
        titleFr: 'Soirée en amoureux',
        mode: 'date' as const,
        generatedAtIso: new Date().toISOString(),
        steps: [],
      };
      redisMock.getJson.mockResolvedValueOnce(cachedExp);

      const result = await service.buildExperience({ lat: 48.856, lng: 2.352, radius: 3000, mode: 'date' });

      expect(result.titleFr).toBe('Soirée en amoureux');
      expect(aiMock.runStructured).not.toHaveBeenCalled();
    });

    it('génère l\'expérience via l\'IA et la met en cache si absent du cache', async () => {
      aiMock.runStructured.mockResolvedValue({
        titleFr: 'Votre soirée',
        steps: [{ order: 1, labelFr: 'Dîner', universe: 'restaurant', reasonFr: 'Pour débuter' }],
      });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p1', universe: 'restaurant', rating: 4.9, distanceMeters: 200 }),
      ]);

      const result = await service.buildExperience({ lat: 48.856, lng: 2.352, radius: 3000, mode: 'date' });

      expect(result.steps).toHaveLength(1);
      expect(redisMock.setJson).toHaveBeenCalledWith(
        expect.stringContaining('reco:experience'),
        expect.objectContaining({ mode: 'date' }),
        600,
      );
    });
  });

  describe('sélection du moteur IA (selectEngine via top3)', () => {
    beforeEach(() => {
      aiMock.runStructured.mockResolvedValue({ reason: '', universesSuggested: [] });
      placesMock.nearby.mockResolvedValue([]);
    });

    it('utilise le moteur culture quand des restrictions sont présentes', async () => {
      await service.top3({ lat: 0, lng: 0, radius: 1000, restrictions: ['Halal'] });
      expect(aiMock.runStructured).toHaveBeenCalledWith('culture', expect.anything());
    });

    it('utilise le moteur weather quand il fait chaud (≥28°C)', async () => {
      await service.top3({ lat: 0, lng: 0, radius: 1000, weather: { tempC: 34, condition: 'sunny' } });
      expect(aiMock.runStructured).toHaveBeenCalledWith('weather', expect.anything());
    });

    it('utilise le moteur weather sous 6°C', async () => {
      await service.top3({ lat: 0, lng: 0, radius: 1000, weather: { tempC: 2, condition: 'cold' } });
      expect(aiMock.runStructured).toHaveBeenCalledWith('weather', expect.anything());
    });

    it('utilise le moteur weather sous la pluie', async () => {
      await service.top3({ lat: 0, lng: 0, radius: 1000, weather: { tempC: 15, condition: 'rain' } });
      expect(aiMock.runStructured).toHaveBeenCalledWith('weather', expect.anything());
    });

    it('utilise le moteur food pour un profil très food (≥60% univers food)', async () => {
      await service.top3({
        lat: 0, lng: 0, radius: 1000,
        favoriteUniverses: ['restaurant', 'cafe', 'bakery', 'bar'],
      });
      expect(aiMock.runStructured).toHaveBeenCalledWith('food', expect.anything());
    });

    it('utilise le moteur mood par défaut', async () => {
      await service.top3({ lat: 0, lng: 0, radius: 1000 });
      expect(aiMock.runStructured).toHaveBeenCalledWith('mood', expect.anything());
    });

    it('culture prend la priorité sur weather', async () => {
      await service.top3({
        lat: 0, lng: 0, radius: 1000,
        restrictions: ['Halal'],
        weather: { tempC: 35, condition: 'canicule' },
      });
      expect(aiMock.runStructured).toHaveBeenCalledWith('culture', expect.anything());
    });
  });

  describe('filterByRestrictions (via top3)', () => {
    beforeEach(() => {
      aiMock.runStructured.mockResolvedValue({ reason: '', universesSuggested: [] });
    });

    it('exclut les bars avec la restriction "sans alcool"', async () => {
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'bar-1', universe: 'bar' }),
        mockPlace({ id: 'resto-1', universe: 'restaurant' }),
      ]);

      const result = await service.top3({
        lat: 0, lng: 0, radius: 1000,
        restrictions: ['Sans alcool'],
      });

      expect(result.suggestions.find((s) => s.place.id === 'bar-1')).toBeUndefined();
      expect(result.suggestions.find((s) => s.place.id === 'resto-1')).toBeDefined();
    });
  });

  describe('dégradation gracieuse quand l\'IA lève une exception', () => {
    it('top3 retourne quand même des suggestions classées par note + distance', async () => {
      aiMock.runStructured.mockRejectedValue(new Error('AI timeout'));
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'p-best', rating: 4.9, distanceMeters: 100 }),
        mockPlace({ id: 'p-worse', rating: 3.5, distanceMeters: 2500 }),
      ]);

      const result = await service.top3({ lat: 48.856, lng: 2.352, radius: 3000 });

      expect(result.suggestions.length).toBeGreaterThan(0);
      // Sans signal IA, le meilleur (note haute + proche) doit ressortir en tête.
      expect(result.suggestions[0].place.id).toBe('p-best');
      // reason vide → fallback déterministe localisé.
      expect(result.reason).toBeTruthy();
    });
  });

  describe('buildExperience — repli sur les étapes par défaut', () => {
    it('utilise EXPERIENCE_FALLBACKS["date"] quand l\'IA renvoie steps=[]', async () => {
      aiMock.runStructured.mockResolvedValue({ titleFr: '', steps: [] });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'bar', universe: 'bar', rating: 4.6, distanceMeters: 150 }),
        mockPlace({ id: 'resto', universe: 'restaurant', rating: 4.7, distanceMeters: 250 }),
        mockPlace({ id: 'roof', universe: 'rooftop', rating: 4.5, distanceMeters: 400 }),
      ]);

      const result = await service.buildExperience({ lat: 48.856, lng: 2.352, radius: 3000, mode: 'date' });

      // Le repli "date" cible bar → restaurant → rooftop.
      const universes = result.steps.map((s) => s.place.universe);
      expect(universes).toContain('bar');
      expect(universes).toContain('restaurant');
      expect(result.titleFr).toBe('Soirée en amoureux'); // titre par défaut quand IA renvoie titleFr vide
    });

    it('ne réutilise jamais deux fois le même lieu entre étapes', async () => {
      aiMock.runStructured.mockResolvedValue({
        titleFr: 'Test',
        steps: [
          { order: 1, labelFr: 'A', universe: 'restaurant', reasonFr: 'r1' },
          { order: 2, labelFr: 'B', universe: 'restaurant', reasonFr: 'r2' },
        ],
      });
      // Un seul restaurant disponible → la 2e étape ne peut pas le réutiliser.
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'only-resto', universe: 'restaurant', rating: 4.8, distanceMeters: 200 }),
      ]);

      const result = await service.buildExperience({ lat: 48.856, lng: 2.352, radius: 3000, mode: 'date' });

      const ids = result.steps.map((s) => s.place.id);
      expect(new Set(ids).size).toBe(ids.length); // aucun doublon
      expect(result.steps).toHaveLength(1);
    });
  });

  describe('scoreOf — boost des univers favoris', () => {
    it('classe un lieu d\'univers favori devant un non-favori à note/distance égales', async () => {
      aiMock.runStructured.mockResolvedValue({ reason: '', universesSuggested: [] });
      placesMock.nearby.mockResolvedValue([
        mockPlace({ id: 'fav', universe: 'cafe', rating: 4.5, distanceMeters: 300 }),
        mockPlace({ id: 'nonfav', universe: 'restaurant', rating: 4.5, distanceMeters: 300 }),
      ]);

      const result = await service.top3({
        lat: 48.856, lng: 2.352, radius: 3000,
        favoriteUniverses: ['cafe'],
      });

      expect(result.suggestions[0].place.id).toBe('fav');
      expect(result.suggestions[0].compatibility).toBeGreaterThan(result.suggestions[1].compatibility);
    });
  });

  describe('chatAboutPlace', () => {
    it('délègue au freeChat de l\'IA avec system + message', async () => {
      aiMock.freeChat.mockResolvedValue('Réponse contextuelle');

      const result = await service.chatAboutPlace('Tu es un guide local', 'Ce resto est-il romantique ?');

      expect(result).toBe('Réponse contextuelle');
      expect(aiMock.freeChat).toHaveBeenCalledWith('Tu es un guide local', 'Ce resto est-il romantique ?');
    });
  });
});
