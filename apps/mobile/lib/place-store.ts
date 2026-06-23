import type { Suggestion } from '@yumia/shared';

let _current: Suggestion | null = null;

export const placeStore = {
  set(s: Suggestion) { _current = s; },
  get(): Suggestion | null { return _current; },
  clear() { _current = null; },
};
