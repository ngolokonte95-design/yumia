/**
 * Choix des étapes d'un itinéraire — constats du 24/11/2026.
 *
 * Un itinéraire « Mode Voyage » demandé pour Las Terrenas montrait :
 *  - en première étape, le cimetière municipal (« Commence par un lieu
 *    emblématique de la ville ») ;
 *  - une étape restée intitulée « Une spécialité locale » sous la photo d'un
 *    commerce précis ;
 *  - la phrase « Chaque étape est un vrai lieu près de toi », à 7 000 km ;
 *  - et, surtout, la trame de repli à la place de l'itinéraire de l'IA : la
 *    réponse du modèle était coupée par un plafond de jetons trop bas.
 */
import { ItineraryService, isFitForItinerary } from '../itinerary.service';
import { withHeadroom } from '../../ai/claude-model';
import type { PlacesService } from '../../places/places.service';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

interface FakePlace {
  id: string;
  name: string;
  rating: number;
  photoUrls: string[];
  lat: number;
  lng: number;
  tags: string[];
}

const place = (id: string, name: string, tags: string[] = []): FakePlace => ({
  id,
  name,
  rating: 0,
  photoUrls: [`https://exemple.test/${id}.jpg`],
  lat: 19.31,
  lng: -69.54,
  tags,
});

const CIMETIERE = place('m1', 'Cementerio Municipal de Las Terrenas', [
  'cemetery', 'point_of_interest', 'service', 'establishment',
]);
const PORTAIL = place('m2', 'Portal de Las Terrenas', ['historical_landmark', 'point_of_interest']);

type Request = Parameters<ItineraryService['generate']>[1];
const voyage: Request = { city: 'Las Terrenas', mood: 'touriste', duration: 'journée', budget: 'moyen' };

const makeService = (
  byCity: (universe: string) => FakePlace[] = () => [],
  byName: (name: string) => FakePlace | null = () => null,
  withAi = false,
) => {
  const places = {
    searchByCity: jest.fn(async ({ universe }: { universe: string }) => byCity(universe)),
    findOrImportByName: jest.fn(async ({ name }: { name: string }) => byName(name)),
  };
  const config = {
    get: () => (withAi
      ? { provider: 'anthropic', anthropicApiKey: 'cle-de-test', modelSmart: 'claude-haiku-5-5' }
      : undefined),
  } as unknown as ConfigService;
  const service = new ItineraryService(places as unknown as PlacesService, {} as PrismaService, config);
  return { service, places };
};

/** Remplace le client du modèle par un faux, et rend l'espion de l'appel. */
const fakeModel = (service: ItineraryService, response: unknown) => {
  const create = jest.fn(async () => response);
  (service as unknown as { ai: unknown }).ai = { messages: { create } };
  return create;
};

const answer = (body: unknown, stop = 'end_turn') => ({
  stop_reason: stop,
  // Une réponse Haiku 5.5 commence souvent par un bloc de réflexion vide.
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: JSON.stringify(body) },
  ],
});

describe('lieux à ne pas proposer par défaut', () => {
  it('écarte un cimetière reconnu à ses types', () => {
    expect(isFitForItinerary(CIMETIERE)).toBe(false);
  });

  it('écarte un cimetière reconnu à son seul nom (lieu importé sans types)', () => {
    expect(isFitForItinerary({ name: 'Cimetière communal', tags: [] })).toBe(false);
    expect(isFitForItinerary({ name: 'Cementerio Municipal de Las Terrenas' })).toBe(false);
    expect(isFitForItinerary({ name: 'Funeraria San José', tags: null })).toBe(false);
  });

  it('écarte station-service, quincaillerie et entreprise de travaux rangées en « point de vue »', () => {
    expect(isFitForItinerary({ name: 'Gasolinera atlantic el limon', tags: ['gas_station', 'scenic_spot'] })).toBe(false);
    expect(isFitForItinerary({ name: 'Ferreteria hermanos Esteban', tags: ['hardware_store'] })).toBe(false);
    expect(isFitForItinerary({ name: 'Panorama de Dios', tags: ['general_contractor', 'service'] })).toBe(false);
  });

  it('garde les lieux ordinaires', () => {
    expect(isFitForItinerary(PORTAIL)).toBe(true);
    expect(isFitForItinerary({ name: 'Mirador Carretera Las Terrenas', tags: ['observation_deck'] })).toBe(true);
    expect(isFitForItinerary({ name: 'La Terrasse', tags: ['restaurant', 'food'] })).toBe(true);
  });
});

describe('trame de repli — choix des lieux', () => {
  it('ne commence plus par le cimetière quand un autre monument existe', async () => {
    const { service } = makeService((u) => (u === 'monument' ? [CIMETIERE, PORTAIL] : []));

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0].name).toBe('Portal de Las Terrenas');
    expect(steps[0].placeId).toBe('m2');
    expect(steps.map((s) => s.name)).not.toContain(CIMETIERE.name);
  });

  it('laisse l’étape sans lieu plutôt que de proposer le cimetière, même venu du fournisseur', async () => {
    const { service } = makeService(
      (u) => (u === 'monument' ? [CIMETIERE] : []),
      () => CIMETIERE,
    );

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0].name).toBe('Un monument incontournable');
    expect(steps[0].placeId).toBeUndefined();
    expect(steps[0].placePhoto).toBeUndefined();
  });

  it('donne à une étape générique le NOM du lieu retenu, même si un mot du titre s’y retrouve', async () => {
    // « Une spécialité locale » partage le mot « spécialité » avec ce commerce :
    // l'étape gardait son titre générique sous la photo du commerce.
    const jenny = place('r1', 'Jenny’s Bubble – spécialité Bubble Waffle', ['restaurant', 'dessert_shop']);
    const { service } = makeService((u) => (u === 'restaurant' ? [jenny, place('r2', 'La Terrasse', ['restaurant'])] : []));

    const { steps } = await service.generate('u1', voyage);

    const repas = steps.find((s) => s.type === 'restaurant')!;
    expect(repas.placeId).toBe('r1');
    expect(repas.name).toBe(jenny.name);
  });

  it('ne dit plus « près de toi » : la ville demandée peut être à l’autre bout du monde', async () => {
    const { service } = makeService();

    const { itinerary } = await service.generate('u1', voyage);

    expect(itinerary).toContain('Las Terrenas');
    expect(itinerary).not.toMatch(/près de toi/i);
  });
});

describe('itinéraire écrit par l’IA', () => {
  const written = {
    summary: 'Une journée entre plage et cascade.',
    steps: [
      { time: '09h00', type: 'balade', name: 'Cascade El Limón', description: 'Baignade au pied de la chute.', duration: '3h', emoji: '💦' },
      { time: '13h00', type: 'restaurant', name: 'Un déjeuner les pieds dans le sable', description: 'Poisson grillé.', duration: '1h30', emoji: '🐟' },
    ],
  };

  it('sert l’itinéraire du modèle, pas la trame de repli', async () => {
    const { service } = makeService(undefined, undefined, true);
    fakeModel(service, answer(written));

    const { itinerary, steps } = await service.generate('u1', voyage);

    expect(itinerary).toBe(written.summary);
    expect(steps.map((s) => s.time)).toEqual(['09h00', '13h00']);
    expect(steps[0].name).toBe('Cascade El Limón');
  });

  it('laisse de la place à la réflexion : effort léger et plafond élargi', async () => {
    const { service } = makeService(undefined, undefined, true);
    const create = fakeModel(service, answer(written));

    await service.generate('u1', voyage);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-5-5',
        max_tokens: withHeadroom(1500, 'low'),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
      }),
    );
  });

  it('retombe sur la trame si la réponse arrive quand même coupée', async () => {
    const { service } = makeService(undefined, undefined, true);
    fakeModel(service, answer(written, 'max_tokens'));

    const { steps } = await service.generate('u1', voyage);

    expect(steps).toHaveLength(5);
    expect(steps[0].time).toBe('10h00');
  });

  it('rattache un cimetière que l’IA nomme expressément : c’est son choix, pas un hasard', async () => {
    const pere = place('p1', 'Cimetière du Père-Lachaise', ['cemetery', 'tourist_attraction']);
    const { service } = makeService((u) => (u === 'monument' ? [pere] : []), undefined, true);
    fakeModel(service, answer({
      summary: 'Paris hors des sentiers battus.',
      steps: [{ time: '10h00', type: 'monument', name: 'Cimetière du Père-Lachaise', description: 'Sur les traces de Chopin.', duration: '2h', emoji: '🕯️' }],
    }));

    const { steps } = await service.generate('u1', { ...voyage, city: 'Paris' });

    expect(steps[0].placeId).toBe('p1');
    expect(steps[0].name).toBe('Cimetière du Père-Lachaise');
  });
});

describe('plafond de jetons', () => {
  it('ajoute la place de la réflexion à la réponse attendue', () => {
    expect(withHeadroom(1000, 'low')).toBe(1500 + 2000);
    expect(withHeadroom(1000, 'medium')).toBe(1500 + 6000);
    expect(withHeadroom(1000, 'high')).toBe(1500 + 12000);
  });

  it('prend l’effort moyen par défaut', () => {
    expect(withHeadroom(400)).toBe(withHeadroom(400, 'medium'));
  });

  it('reste sous le seuil où le SDK exige une réponse en flux', () => {
    // Au-delà d'environ 21 000 jetons, un appel sans flux est refusé par le SDK.
    expect(withHeadroom(4096, 'medium')).toBeLessThan(21000);
  });
});
