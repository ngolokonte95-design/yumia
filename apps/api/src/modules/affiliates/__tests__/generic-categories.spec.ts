import { AffiliatesService } from '../affiliates.service';
import { BookingProvider } from '../providers/booking.provider';
import { GetYourGuideProvider } from '../providers/getyourguide.provider';
import { ViatorProvider } from '../providers/viator.provider';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { PlacesService } from '../../places/places.service';

const makeService = () =>
  new AffiliatesService(
    {} as PrismaService,
    {} as PlacesService,
    new BookingProvider(),
    new GetYourGuideProvider(),
    new ViatorProvider(),
  );

const find = (cats: ReturnType<AffiliatesService['genericCategories']>, key: string) =>
  cats.find((c) => c.category === key)!;

describe('genericCategories', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('déclare ouverts les onglets Booking même sans identifiant d’affilié', () => {
    // Le bug remonté : les onglets Hôtel / Location / Vols s'affichaient et ne
    // faisaient rien. L'API refusait de générer leur lien faute d'AID, alors
    // que la page Booking correspondante fonctionne parfaitement sans.
    delete process.env.BOOKING_AFFILIATE_ID;
    const cats = makeService().genericCategories();

    for (const key of ['hotel', 'car_rental', 'flights']) {
      expect(find(cats, key).configured).toBe(true);
    }
  });

  it('ne déclare pas ouvert un onglet dont le lien ne peut pas être produit', () => {
    // GetYourGuide et Viator, eux, exigent réellement leur identifiant : sans
    // lui l'URL n'aurait aucun sens. L'onglet doit donc rester masqué.
    delete process.env.GETYOURGUIDE_PARTNER_ID;
    delete process.env.VIATOR_PARTNER_ID;
    delete process.env.VIATOR_API_KEY;
    const cats = makeService().genericCategories();

    expect(find(cats, 'activities').configured).toBe(false);
    expect(find(cats, 'skip_the_line').configured).toBe(false);
  });

  it('couvre exactement les catégories connues du mobile', () => {
    // La grille mobile filtre sur ces clés : une divergence ferait disparaître
    // un onglet sans erreur nulle part.
    const keys = makeService().genericCategories().map((c) => c.category).sort();
    expect(keys).toEqual([
      'activities', 'adventure', 'airport_transfer', 'car_rental', 'flights',
      'food_tours', 'hop_on_hop_off', 'hotel', 'shows', 'skip_the_line',
    ]);
  });

  it("n'a aucun effet de bord — la sonde peut être appelée à répétition", () => {
    const service = makeService();
    const first = service.genericCategories();
    const second = service.genericCategories();
    expect(second).toEqual(first);
  });
});

describe('BookingProvider.generateGenericLink', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('pointe vers la bonne page selon le produit', () => {
    delete process.env.BOOKING_AFFILIATE_ID;
    const p = new BookingProvider();
    expect(p.generateGenericLink('t')).toBe('https://www.booking.com/index.html');
    expect(p.generateGenericLink('t', 'cars')).toBe('https://www.booking.com/cars/index.html');
    expect(p.generateGenericLink('t', 'flights')).toBe('https://www.booking.com/flights/index.html');
  });

  it("ajoute le tracking dès que l'identifiant d'affilié existe", () => {
    process.env.BOOKING_AFFILIATE_ID = '123456';
    const url = new BookingProvider().generateGenericLink('clic-abc', 'cars')!;
    expect(url).toContain('/cars/index.html');
    expect(url).toContain('aid=123456');
    expect(url).toContain('label=clic-abc');
  });
});
