/**
 * Position partagée (lib/location-store.ts).
 * expo-location est simulé : on vérifie l'ordre des appels, les délais bornés
 * et ce que voient les écrans.
 */
const requestPerm = jest.fn();
const getPerm = jest.fn();
const servicesEnabled = jest.fn();
const getCurrent = jest.fn();
const getLastKnown = jest.fn();
const reverseGeocode = jest.fn();

jest.mock('expo-location', () => ({
  __esModule: true,
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: () => requestPerm(),
  getForegroundPermissionsAsync: () => getPerm(),
  hasServicesEnabledAsync: () => servicesEnabled(),
  getCurrentPositionAsync: (o: unknown) => getCurrent(o),
  getLastKnownPositionAsync: (o: unknown) => getLastKnown(o),
  reverseGeocodeAsync: (o: unknown) => reverseGeocode(o),
}), { virtual: true });

import {
  __resetLocationStoreForTests, ensureLocation, getLocationSnapshot, refreshIfMoved, retryLocation,
  subscribeLocation,
} from '../location-store';
import { DEFAULT_LOCATION } from '../config';

const CERGY = { coords: { latitude: 49.036, longitude: 2.063 } };
const CERGY_50M = { coords: { latitude: 49.0364, longitude: 2.063 } };
const PONTOISE = { coords: { latitude: 49.05, longitude: 2.1 } };
const never = () => new Promise(() => {});

/** Laisse les promesses déjà résolues avancer, sans faire tourner les minuteries. */
async function flush(times = 12) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-24T12:00:00Z'));
  __resetLocationStoreForTests();
  for (const m of [requestPerm, getPerm, servicesEnabled, getCurrent, getLastKnown, reverseGeocode]) m.mockReset();
  requestPerm.mockResolvedValue({ status: 'granted' });
  getPerm.mockResolvedValue({ status: 'granted' });
  servicesEnabled.mockResolvedValue(true);
  reverseGeocode.mockResolvedValue([{ city: 'Cergy' }]);
});
afterEach(() => jest.useRealTimers());

describe('location-store', () => {
  it('part en recherche, sur la position par défaut', () => {
    expect(getLocationSnapshot()).toEqual({ coords: DEFAULT_LOCATION, resolving: true, status: 'loading', city: null });
  });

  it('utilise tout de suite la dernière position connue, sans attendre le GPS', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockImplementation(never); // GPS qui ne répond jamais
    ensureLocation();
    await flush();
    const s = getLocationSnapshot();
    expect(s.resolving).toBe(false);
    expect(s.status).toBe('granted');
    expect(s.coords).toEqual({ lat: 49.036, lng: 2.063 });
    expect(s.city).toBe('Cergy');
  });

  it('un géocodeur qui ne répond jamais ne bloque pas la position', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    reverseGeocode.mockImplementation(never);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().resolving).toBe(false);
    expect(getLocationSnapshot().status).toBe('granted');
    expect(getLocationSnapshot().city).toBeNull();
  });

  it('le relevé précis ne déplace la position que si on a vraiment bougé', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY_50M);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().coords).toEqual({ lat: 49.036, lng: 2.063 }); // 44 m : inchangée

    getCurrent.mockResolvedValue(PONTOISE);
    await refreshIfMoved(300);
    await flush();
    expect(getLocationSnapshot().coords).toEqual({ lat: 49.05, lng: 2.1 });
  });

  it('sans dernière position connue, attend le GPS', async () => {
    getLastKnown.mockResolvedValue(null);
    getCurrent.mockResolvedValue(PONTOISE);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().coords).toEqual({ lat: 49.05, lng: 2.1 });
    expect(getLocationSnapshot().resolving).toBe(false);
  });

  it('GPS muet et rien de connu : repli après les délais, jamais une attente infinie', async () => {
    getLastKnown.mockImplementation(never);
    getCurrent.mockImplementation(never);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().resolving).toBe(true);
    await jest.advanceTimersByTimeAsync(1_500); // dernière position « récente »
    await jest.advanceTimersByTimeAsync(8_000); // relevé précis
    await jest.advanceTimersByTimeAsync(3_000); // dernière position ancienne
    await flush();
    expect(getLocationSnapshot()).toEqual({ coords: DEFAULT_LOCATION, resolving: false, status: 'fallback', city: null });
  });

  it('permission refusée : position par défaut, sans lecture GPS', async () => {
    requestPerm.mockResolvedValue({ status: 'denied' });
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().status).toBe('denied');
    expect(getLocationSnapshot().resolving).toBe(false);
    expect(getCurrent).not.toHaveBeenCalled();
    expect(getLastKnown).not.toHaveBeenCalled();
  });

  it('localisation coupée dans les réglages : repli immédiat', async () => {
    servicesEnabled.mockResolvedValue(false);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().status).toBe('fallback');
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('un deuxième écran qui ouvre ne relance rien et a la position tout de suite', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    ensureLocation();
    await flush();
    const calls = requestPerm.mock.calls.length;
    const before = getLocationSnapshot();
    ensureLocation(); // autre écran, quelques secondes plus tard
    await flush();
    expect(requestPerm.mock.calls.length).toBe(calls);
    expect(getLocationSnapshot()).toBe(before); // même objet : aucun écran ne se redessine
    expect(getLocationSnapshot().resolving).toBe(false);
  });

  it('après une minute, relit en silence sans repasser en recherche', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    ensureLocation();
    await flush();
    const seen: boolean[] = [];
    subscribeLocation(() => seen.push(getLocationSnapshot().resolving));
    jest.setSystemTime(new Date('2026-11-24T12:05:00Z'));
    getCurrent.mockResolvedValue(PONTOISE);
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().coords).toEqual({ lat: 49.05, lng: 2.1 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r === false)).toBe(true);
    expect(requestPerm).toHaveBeenCalledTimes(1); // pas de nouvelle demande de permission
  });

  it('un relevé raté ne fait pas perdre la position déjà obtenue', async () => {
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    ensureLocation();
    await flush();
    getCurrent.mockRejectedValue(new Error('gps'));
    await refreshIfMoved(300);
    expect(getLocationSnapshot().status).toBe('granted');
    expect(getLocationSnapshot().coords).toEqual({ lat: 49.036, lng: 2.063 });
  });

  it('refusée puis accordée dans les réglages : retrouvée sans redemander', async () => {
    requestPerm.mockResolvedValue({ status: 'denied' });
    getPerm.mockResolvedValue({ status: 'denied' });
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().status).toBe('denied');
    getPerm.mockResolvedValue({ status: 'granted' });
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    jest.setSystemTime(new Date('2026-11-24T12:01:00Z'));
    ensureLocation();
    await flush();
    expect(getLocationSnapshot().status).toBe('granted');
    expect(requestPerm).toHaveBeenCalledTimes(1);
  });

  it('« Réessayer » redemande la permission', async () => {
    requestPerm.mockResolvedValue({ status: 'denied' });
    ensureLocation();
    await flush();
    requestPerm.mockResolvedValue({ status: 'granted' });
    getLastKnown.mockResolvedValue(CERGY);
    getCurrent.mockResolvedValue(CERGY);
    retryLocation();
    await flush();
    expect(requestPerm).toHaveBeenCalledTimes(2);
    expect(getLocationSnapshot().status).toBe('granted');
  });
});
