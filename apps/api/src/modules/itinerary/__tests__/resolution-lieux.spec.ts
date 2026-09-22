/**
 * Rattachement des lieux à un itinéraire déjà rédigé.
 *
 * Ces tests tournent sans IA : sans clé configurée, `generate` bascule sur sa
 * trame déterministe (sept journées de trois moments) — exactement le
 * matériau dont la phase de résolution a besoin, sans dépendre du modèle.
 *
 * Ce qu'ils protègent : la résolution se fait en trois phases parallélisées
 * (préchargement des univers, rattachement en base, appels au fournisseur).
 * Le passage du tout-séquentiel à ce découpage ne doit changer ni ce qui est
 * rattaché, ni le nombre d'appels facturés au fournisseur.
 */
import { ItineraryService } from '../itinerary.service';
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
}

const place = (id: string, name: string, withPhoto = true): FakePlace => ({
  id,
  name,
  rating: 4.5,
  photoUrls: withPhoto ? [`https://exemple.test/${id}.jpg`] : [],
  lat: 48.85,
  lng: 2.35,
});

/**
 * @param byCity ce que la base rend pour un univers (défaut : rien)
 * @param byName ce que le fournisseur rend pour un nom (défaut : rien)
 */
const makeService = (
  byCity: (universe: string) => FakePlace[] = () => [],
  byName: (name: string) => FakePlace | null = () => null,
) => {
  const places = {
    searchByCity: jest.fn(async ({ universe }: { universe: string }) => byCity(universe)),
    findOrImportByName: jest.fn(async ({ name }: { name: string }) => byName(name)),
  };
  // Pas de clé IA : `generate` prend sa trame déterministe, et c'est bien la
  // résolution des lieux qu'on observe, pas le modèle.
  const config = { get: () => undefined } as unknown as ConfigService;
  const service = new ItineraryService(
    places as unknown as PlacesService,
    {} as PrismaService,
    config,
  );
  return { service, places };
};

const weekRequest = {
  city: 'Saint-Domingue',
  mood: 'amis',
  duration: 'semaine',
  budget: 'moyen',
} as Parameters<ItineraryService['generate']>[1];

/**
 * Les noms de moments de la trame, journée par journée.
 *
 * Lus depuis une génération à vide plutôt que recopiés ici : le test suit la
 * trame si elle change, au lieu de casser sur un libellé réécrit.
 */
const momentNames = async (): Promise<string[][]> => {
  const { service } = makeService();
  const { steps } = await service.generate('u0', weekRequest);
  return steps.map((day) => (day.moments ?? []).map((m) => m.name));
};

describe('résolution des lieux — journées', () => {
  it('illustre chaque journée avec la photo d’un de ses moments', async () => {
    const connus = (await momentNames()).flat();
    const { service } = makeService((_u) => connus.map((n, i) => place(`db-${i}`, n)));

    const { steps } = await service.generate('u1', weekRequest);

    expect(steps).toHaveLength(7);
    for (const day of steps) {
      expect(day.placePhoto).toBeTruthy();
      // La vignette illustre : elle ne prétend pas que la journée soit ce lieu.
      expect(day.placeId).toBeUndefined();
    }
  });

  it('n’appelle pas le fournisseur quand la base a déjà fourni une photo', async () => {
    const connus = (await momentNames()).flat();
    const { service, places } = makeService((_u) => connus.map((n, i) => place(`db-${i}`, n)));

    await service.generate('u1', weekRequest);

    expect(places.findOrImportByName).not.toHaveBeenCalled();
  });

  it('tente le SECOND moment quand le premier est résolu sans photo', async () => {
    // Le fournisseur retrouve chaque moment, mais n'a de photo que pour ceux
    // du midi : la journée reste à illustrer après le premier essai, et c'est
    // le moment SUIVANT qui doit être tenté.
    //
    // Régression : un filtre « moments sans placeId » recalculé au second tour
    // sautait ce moment — le premier venait justement de recevoir un placeId.
    const avecPhoto = (name: string) => /déjeuner|café|table/i.test(name);
    const { service, places } = makeService(
      () => [],
      (name) => place(`p-${name}`, name, avecPhoto(name)),
    );

    const { steps } = await service.generate('u1', weekRequest);

    const demandes = places.findOrImportByName.mock.calls.map(([{ name }]) => name as string);
    for (const day of steps) {
      expect(demandes).toContain(day.moments?.[0]?.name);
      expect(demandes).toContain(day.moments?.[1]?.name);
      // Jamais de troisième essai : deux par journée, pas plus.
      expect(demandes).not.toContain(day.moments?.[2]?.name);
    }
  });

  it('s’arrête à deux essais par journée, même sans jamais trouver', async () => {
    // Sans plafond, le fournisseur serait appelé pour les trois moments de
    // chacune des sept journées — vingt-et-un appels facturés pour rien.
    const { service, places } = makeService(() => [], () => null);

    const { steps } = await service.generate('u1', weekRequest);

    expect(places.findOrImportByName.mock.calls.length).toBeLessThanOrEqual(14);
    for (const day of steps) expect(day.placePhoto).toBeUndefined();
  });

  it('ne garde rien de la génération précédente', async () => {
    // La trame de repli est une constante partagée : sans copie en
    // profondeur, la première génération y écrivait ses lieux, et la suivante
    // — dans une autre ville — les héritait sans jamais les chercher.
    const premier = makeService(() => [], (name) => place(`p-${name}`, name));
    await premier.service.generate('u1', weekRequest);

    const second = makeService();
    const { steps } = await second.service.generate('u2', {
      ...weekRequest,
      city: 'Reykjavik',
    });

    for (const day of steps) {
      for (const moment of day.moments ?? []) {
        expect(moment.placeId).toBeUndefined();
        expect(moment.placePhoto).toBeUndefined();
      }
    }
  });
});

describe('résolution des lieux — préchargement', () => {
  it('ne demande qu’une fois chaque univers, malgré vingt-et-un moments', async () => {
    const { service, places } = makeService((u) => [place(`${u}-1`, `Lieu ${u}`)]);

    await service.generate('u1', weekRequest);

    const universes = places.searchByCity.mock.calls.map(([{ universe }]) => universe as string);
    expect(universes.length).toBe(new Set(universes).size);
  });
});
