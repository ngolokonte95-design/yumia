import type { Suggestion } from '@yumia/shared';
import { placeStore } from '../place-store';

const makeSuggestion = (id = 'p1'): Suggestion => ({
  place: {
    id,
    name: 'Le Bistrot',
    universe: 'restaurant',
    location: { lat: 48.856, lng: 2.352 },
    city: 'Paris',
    countryCode: 'FR',
    rating: 4.5,
    priceTier: 2,
    photoUrls: [],
    tags: [],
  },
  compatibility: 88,
  distanceMeters: 300,
  reason: 'Top.',
  engine: 'mood',
});

describe('placeStore', () => {
  afterEach(() => placeStore.clear());

  it('get retourne null par défaut', () => {
    expect(placeStore.get()).toBeNull();
  });

  it('set puis get retourne la suggestion stockée', () => {
    const s = makeSuggestion();
    placeStore.set(s);
    expect(placeStore.get()).toBe(s);
  });

  it('set écrase la valeur précédente', () => {
    placeStore.set(makeSuggestion('p1'));
    const second = makeSuggestion('p2');
    placeStore.set(second);
    expect(placeStore.get()?.place.id).toBe('p2');
  });

  it('clear remet à null', () => {
    placeStore.set(makeSuggestion());
    placeStore.clear();
    expect(placeStore.get()).toBeNull();
  });
});
