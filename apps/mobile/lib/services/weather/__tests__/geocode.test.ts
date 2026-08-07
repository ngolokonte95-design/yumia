import { searchCities } from '../geocode';

function mockFetch(body: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status, json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('searchCities', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('mappe les résultats bruts vers CitySuggestion', async () => {
    global.fetch = mockFetch({
      results: [
        { id: 2988507, name: 'Paris', latitude: 48.8534, longitude: 2.3488, country: 'France', admin1: 'Île-de-France' },
      ],
    }) as never;

    const cities = await searchCities('paris');
    expect(cities).toEqual([
      { id: 2988507, name: 'Paris', lat: 48.8534, lng: 2.3488, country: 'France', admin1: 'Île-de-France' },
    ]);
  });

  it('ne fait aucun appel réseau pour une requête trop courte', async () => {
    const fetchSpy = mockFetch({ results: [] });
    global.fetch = fetchSpy as never;

    const cities = await searchCities('p');
    expect(cities).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renvoie un tableau vide si la réponse ne contient pas `results`', async () => {
    global.fetch = mockFetch({}) as never;
    expect(await searchCities('atlantide')).toEqual([]);
  });

  it('lève une erreur explicite sur une réponse HTTP en échec', async () => {
    global.fetch = mockFetch({}, false, 500) as never;
    await expect(searchCities('paris')).rejects.toThrow('HTTP 500');
  });
});
