import type { SavedItinerary } from './itinerary-api';

let _current: SavedItinerary | null = null;

export const savedItineraryStore = {
  set(i: SavedItinerary) { _current = i; },
  get(): SavedItinerary | null { return _current; },
  clear() { _current = null; },
};
