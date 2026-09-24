import { GooglePlacesProvider } from '../providers/google-places.provider';

/**
 * CGU Google Maps Platform : l'auteur d'une photo Places doit s'afficher avec
 * elle. `authorAttributions` arrive avec le champ `photos` déjà demandé — on le
 * garde au lieu de le jeter, sans rien ajouter au FieldMask.
 */
describe('GooglePlacesProvider — auteurs des photos', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  const mockFetch = (body: unknown) => {
    const fn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  it('findPhotos renvoie les références et leur auteur, sans élargir le FieldMask', async () => {
    const fetchMock = mockFetch({
      places: [{
        id: 'abc',
        photos: [
          { name: 'places/abc/photos/1', authorAttributions: [{ displayName: 'Marie D.', uri: 'https://maps.google.com/contrib/1' }] },
          { name: 'places/abc/photos/2', authorAttributions: [] },
        ],
      }],
    });
    const provider = new GooglePlacesProvider('key');

    const res = await provider.findPhotos('Le Bistrot Paris', 48.85, 2.35);

    expect(res.refs).toEqual(['places/abc/photos/1', 'places/abc/photos/2']);
    expect(res.attributions).toEqual({
      'places/abc/photos/1': { displayName: 'Marie D.', uri: 'https://maps.google.com/contrib/1' },
    });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe('places.id,places.photos');
  });

  it('searchNearby garde les auteurs et ne demande aucun champ Enterprise', async () => {
    const fetchMock = mockFetch({
      places: [{
        id: 'abc',
        displayName: { text: 'Le Bistrot' },
        location: { latitude: 48.85, longitude: 2.35 },
        types: ['restaurant'],
        formattedAddress: '1 rue X, 75001 Paris, France',
        addressComponents: [
          { longText: 'Paris', types: ['locality'] },
          { shortText: 'FR', types: ['country'] },
        ],
        photos: [{ name: 'places/abc/photos/1', authorAttributions: [{ displayName: 'Marie D.' }] }],
      }],
    });
    const provider = new GooglePlacesProvider('key');

    const [place] = await provider.searchNearby({ lat: 48.85, lng: 2.35, radius: 500, universe: 'restaurant' } as never);

    expect(place.photoAttributions).toEqual({ 'places/abc/photos/1': { displayName: 'Marie D.' } });
    const mask = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['X-Goog-FieldMask'];
    expect(mask).not.toMatch(/rating|priceLevel|regularOpeningHours/);
  });
});
