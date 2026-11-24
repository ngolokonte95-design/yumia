/**
 * Lieux réels donnés au modèle — constats du 24/11/2026.
 *
 * Un itinéraire Las Terrenas écrit par l'IA (après la correction du plafond
 * de jetons) laissait trois étapes sur six sans photo :
 *  - « Petit-déjeuner au Café Bonito » et « Déjeuner au Rancho Pelo Malo » :
 *    deux établissements absents de la base (201 lieux) comme des réponses
 *    de Google — le modèle les avait nommés de mémoire, sans doute inventés ;
 *  - « Ruelles colorées et street art » : une balade, pas un lieu ;
 * et l'étape « Marché local (Mercado Municipal) » montrait la photo de la
 * mairie, « Ayuntamiento Municipal Las Terrenas ».
 */
import { ItineraryService, knownPlacesBlock, namesMatch } from '../itinerary.service';
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
  rating: 4.5,
  photoUrls: [`https://exemple.test/${id}.jpg`],
  lat: 19.31,
  lng: -69.54,
  tags,
});

const CAYUCO = place('r1', 'El Cayuco de la Bonita', ['restaurant']);
const MAREA = place('b1', 'Marea By Playa Bonita', ['brunch_restaurant']);
const MIRADOR = place('p1', 'Mirador Carretera Las Terrenas', ['observation_deck']);
const CIMETIERE = place('m1', 'Cementerio Municipal de Las Terrenas', ['cemetery']);
const MAIRIE = place('h1', 'Ayuntamiento Municipal Las Terrenas', ['city_hall']);

const BASE: Record<string, FakePlace[]> = {
  restaurant: [CAYUCO],
  cafe: [MAREA],
  photo_spot: [MIRADOR],
  monument: [CIMETIERE],
};

type Request = Parameters<ItineraryService['generate']>[1];
const voyage: Request = { city: 'Las Terrenas', mood: 'touriste', duration: 'journée', budget: 'moyen' };

const makeService = (byName: (name: string) => FakePlace | null = () => null) => {
  const places = {
    searchByCity: jest.fn(async ({ universe }: { universe: string }) => BASE[universe] ?? []),
    findOrImportByName: jest.fn(async ({ name }: { name: string; prefer?: (p: FakePlace) => boolean }) => byName(name)),
  };
  const config = {
    get: () => ({ provider: 'anthropic', anthropicApiKey: 'cle-de-test', modelSmart: 'claude-haiku-5-5' }),
  } as unknown as ConfigService;
  const service = new ItineraryService(places as unknown as PlacesService, {} as PrismaService, config);
  return { service, places };
};

const fakeModel = (service: ItineraryService, body: unknown) => {
  const create = jest.fn(async () => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(body) }],
  }));
  (service as unknown as { ai: unknown }).ai = { messages: { create } };
  return create;
};

/** Le texte de la consigne envoyée au modèle. */
const promptOf = (create: jest.Mock): string => {
  const call = create.mock.calls[0] as unknown as [{ messages: Array<{ content: string }> }];
  return call[0].messages[0].content;
};

const step = (fields: Record<string, unknown>) => ({
  time: '09h00',
  type: 'restaurant',
  description: 'Une étape.',
  duration: '1h',
  emoji: '📍',
  ...fields,
});

describe('les vrais lieux de la ville sont donnés au modèle', () => {
  it('liste les lieux de la base dans la consigne, et la règle de ne rien inventer', async () => {
    const { service } = makeService();
    const create = fakeModel(service, { summary: 'S.', steps: [step({ name: 'X', place: '' })] });

    await service.generate('u1', voyage);

    const prompt = promptOf(create);
    expect(prompt).toContain('El Cayuco de la Bonita');
    expect(prompt).toContain('Marea By Playa Bonita');
    expect(prompt).toContain('Mirador Carretera Las Terrenas');
    expect(prompt).toMatch(/N'invente JAMAIS un nom d'établissement/);
    expect(prompt).toContain('"place"');
  });

  it('ne propose pas au modèle un lieu qu’on ne proposerait pas soi-même (cimetière)', async () => {
    const { service } = makeService();
    const create = fakeModel(service, { summary: 'S.', steps: [step({ name: 'X', place: '' })] });

    await service.generate('u1', voyage);

    expect(promptOf(create)).not.toContain('Cementerio');
  });

  it('ne met aucun bloc quand la base ne connaît rien de la ville', () => {
    expect(knownPlacesBlock('Nulle-Part', [{ universe: 'restaurant', places: [] }])).toBe('');
  });

  it('range les lieux sous le type d’étape que le modèle connaît', () => {
    const block = knownPlacesBlock('Las Terrenas', [
      { universe: 'photo_spot', places: [MIRADOR] },
      { universe: 'museum', places: [{ name: 'Museo X' }] },
    ]);
    expect(block).toContain('- photo : Mirador Carretera Las Terrenas');
    expect(block).toContain('- musée : Museo X');
  });
});

describe('rattachement par le lieu que le modèle a choisi', () => {
  it('rattache le lieu recopié de la liste et garde le titre écrit par le modèle', async () => {
    const { service, places } = makeService();
    fakeModel(service, {
      summary: 'S.',
      steps: [step({ name: 'Déjeuner les pieds dans le sable', place: 'El Cayuco de la Bonita' })],
    });

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0].name).toBe('Déjeuner les pieds dans le sable');
    expect(steps[0].placeId).toBe('r1');
    expect(steps[0].placePhoto).toBe('https://exemple.test/r1.jpg');
    expect(places.findOrImportByName).not.toHaveBeenCalled();
  });

  it('retrouve le lieu dans la liste même rangé sous un autre type d’étape', async () => {
    // Le modèle a classé l'étape « brunch » mais choisi un lieu de la liste « cafe ».
    const { service } = makeService();
    fakeModel(service, { summary: 'S.', steps: [step({ type: 'brunch', name: 'Brunch face à la mer', place: 'marea by playa bonita' })] });

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0].placeId).toBe('b1');
  });

  it('n’attache rien, et ne paie aucune recherche, pour une étape qui n’est pas un lieu', async () => {
    const { service, places } = makeService(() => MAIRIE);
    fakeModel(service, {
      summary: 'S.',
      steps: [step({ type: 'balade', name: 'Ruelles colorées et street art du centre-ville', place: '' })],
    });

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0].placeId).toBeUndefined();
    expect(steps[0].placePhoto).toBeUndefined();
    expect(places.findOrImportByName).not.toHaveBeenCalled();
  });

  it('cherche chez le fournisseur par le NOM du lieu, pas par le titre de l’étape', async () => {
    const limon = place('n1', 'Salto El Limón', ['tourist_attraction']);
    const { service, places } = makeService((name) => (name === 'Cascade El Limón' ? limon : null));
    fakeModel(service, {
      summary: 'S.',
      steps: [step({ type: 'activité', name: 'Baignade au pied de la cascade', place: 'Cascade El Limón' })],
    });

    const { steps } = await service.generate('u1', voyage);

    expect(places.findOrImportByName).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cascade El Limón' }));
    expect(steps[0].placeId).toBe('n1');
    expect(steps[0].name).toBe('Baignade au pied de la cascade');
  });

  it('demande au fournisseur de choisir, parmi ses réponses, celle qui porte le bon nom', async () => {
    const { service, places } = makeService();
    fakeModel(service, { summary: 'S.', steps: [step({ type: 'activité', name: 'Baignade', place: 'Cascade El Limón' })] });

    await service.generate('u1', voyage);

    const { prefer } = places.findOrImportByName.mock.calls[0][0];
    expect(prefer).toBeDefined();
    expect(prefer!(place('x', 'Cascada El Limón'))).toBe(true);
    expect(prefer!(place('y', 'Hotel Bonito'))).toBe(false);
  });

  it('ne renvoie pas le champ interne `place` à l’app', async () => {
    const { service } = makeService();
    fakeModel(service, { summary: 'S.', steps: [step({ name: 'Déjeuner', place: 'El Cayuco de la Bonita' })] });

    const { steps } = await service.generate('u1', voyage);

    expect(steps[0]).not.toHaveProperty('place');
  });

  it('ignore un `place` qui n’est pas du texte', async () => {
    const { service } = makeService();
    fakeModel(service, { summary: 'S.', steps: [step({ name: 'El Cayuco de la Bonita', place: null })] });

    const { steps } = await service.generate('u1', voyage);

    // Sans champ exploitable, le titre sert à la recherche, comme avant.
    expect(steps[0].placeId).toBe('r1');
  });
});

describe('le marché n’est plus confondu avec la mairie', () => {
  it('ne rapproche pas « Marché local (Mercado Municipal) » de l’Ayuntamiento', () => {
    expect(namesMatch(
      'Marché local de Las Terrenas (Mercado Municipal)',
      'Ayuntamiento Municipal Las Terrenas',
      'Las Terrenas',
    )).toBe(false);
  });

  it('ne rapproche pas deux lieux sur le seul mot « municipal »', () => {
    expect(namesMatch('Mercado Municipal', 'Ayuntamiento Municipal')).toBe(false);
    expect(namesMatch('Musée national', 'Théâtre national')).toBe(false);
  });

  it('reconnaît toujours deux noms identiques, même faits de mots ignorés', () => {
    expect(namesMatch('Mercado Municipal', 'Mercado Municipal')).toBe(true);
    expect(namesMatch('Mercado Municipal', 'mercado municipal')).toBe(true);
  });
});
