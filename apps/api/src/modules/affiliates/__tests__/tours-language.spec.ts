import { AffiliatesService, viatorLanguage } from '../affiliates.service';
import { BookingProvider } from '../providers/booking.provider';
import { GetYourGuideProvider } from '../providers/getyourguide.provider';
import { ViatorProvider, type TourListing } from '../providers/viator.provider';
import { DiscoverCarsProvider } from '../providers/discovercars.provider';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { PlacesService } from '../../places/places.service';

const tour = (code: string, title: string): TourListing => ({
  provider: 'viator', code, title, imageUrl: null, rating: 4.8, reviewCount: 120,
  fromPrice: 30, currency: 'EUR', durationMinutes: 120, freeCancellation: true, url: `https://viator.com/${code}`,
});

/**
 * Viator simulé : la recherche en français sert le filtre de pertinence ;
 * `byLanguage` dit ce que renvoie chaque autre langue (null = langue refusée
 * pour la clé API).
 */
const makeService = (byLanguage: Record<string, TourListing[] | null>) => {
  const viator = new ViatorProvider();
  jest.spyOn(viator, 'searchTours').mockImplementation(async (_c, _t, _term, _l, _s, language = 'fr-FR') =>
    language === 'fr-FR'
      ? [tour('P1', 'Visite guidée du Vieux-Port'), tour('P2', 'Croisière dans les calanques')]
      : byLanguage[language] ?? null,
  );
  const prisma = { affiliateClick: { create: jest.fn().mockResolvedValue({}) } } as unknown as PrismaService;
  return new AffiliatesService(prisma, {} as PlacesService, new BookingProvider(), new GetYourGuideProvider(), viator, new DiscoverCarsProvider());
};

describe('viatorLanguage', () => {
  it('français : rien à traduire', () => expect(viatorLanguage('fr')).toBeNull());
  it('langues proposées par Viator', () => {
    expect(viatorLanguage('de')).toBe('de-DE');
    expect(viatorLanguage('es')).toBe('es-ES');
  });
  it('langues absentes de Viator : anglais', () => {
    for (const l of ['ar', 'pl', 'ru', 'hi']) expect(viatorLanguage(l)).toBe('en-US');
  });
});

describe('guidedTours — titres dans la langue de l\'utilisateur', () => {
  it('remplace les titres par code produit', async () => {
    const service = makeService({ 'de-DE': [tour('P2', 'Bootsfahrt in den Calanques'), tour('P1', 'Führung durch den Alten Hafen')] });
    const { tours } = await service.guidedTours('Marseille', 'u1', 'guides', undefined, [], undefined, 1, false, 'de');
    expect(tours.map((t) => t.title)).toEqual(['Führung durch den Alten Hafen', 'Bootsfahrt in den Calanques']);
  });

  it('langue refusée par la clé : repli sur l\'anglais', async () => {
    const service = makeService({ 'de-DE': null, 'en-US': [tour('P1', 'Old Port guided tour'), tour('P2', 'Calanques cruise')] });
    const { tours } = await service.guidedTours('Marseille', 'u1', 'guides', undefined, [], undefined, 1, false, 'de');
    expect(tours[0].title).toBe('Old Port guided tour');
  });

  it('tout refusé : titres français, sans erreur', async () => {
    const service = makeService({ 'de-DE': null, 'en-US': null });
    const { tours } = await service.guidedTours('Marseille', 'u1', 'guides', undefined, [], undefined, 1, false, 'de');
    expect(tours[0].title).toBe('Visite guidée du Vieux-Port');
  });

  it('offre absente de la page traduite : garde son titre français', async () => {
    const service = makeService({ 'en-US': [tour('P1', 'Old Port guided tour')] });
    const { tours } = await service.guidedTours('Marseille', 'u1', 'guides', undefined, [], undefined, 1, false, 'en');
    expect(tours.map((t) => t.title)).toEqual(['Old Port guided tour', 'Croisière dans les calanques']);
  });
});
