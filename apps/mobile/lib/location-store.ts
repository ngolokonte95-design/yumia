/**
 * Position de l'utilisateur, partagée par toute l'application.
 *
 * Avant (jusqu'au 24/11/2026), chaque écran relisait la position pour lui :
 * permission, GPS, nom de la ville. Sur Android cela prend plusieurs secondes
 * (parfois ne répond jamais), si bien qu'ouvrir un univers affichait « Aucun
 * lieu » pendant ce temps, à chaque ouverture. Désormais :
 *
 * - UNE seule lecture pour toute l'app ; les écrans suivants l'ont tout de suite ;
 * - la dernière position connue du système sert d'abord (immédiate), le relevé
 *   précis arrive ensuite en silence et ne remplace la position que si l'on a
 *   vraiment bougé ;
 * - le nom de la ville se cherche à part, sans faire attendre personne ;
 * - chaque appel au système est borné dans le temps.
 *
 * Module sans React ni react-native : testable tel quel (voir __tests__).
 */
import * as Location from 'expo-location';
import { DEFAULT_LOCATION } from './config';

export type LocationStatus = 'loading' | 'granted' | 'denied' | 'fallback';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationSnapshot {
  coords: Coordinates;
  /** `true` seulement pendant la toute première lecture (ou un « réessayer »). */
  resolving: boolean;
  status: LocationStatus;
  /** Ville résolue par géocodage inverse (null si indisponible). */
  city: string | null;
}

/** Relevé précis : au-delà, on se rabat sur la dernière position connue. */
const POSITION_TIMEOUT_MS = 8_000;
/** Dernière position connue « récente » : utilisée d'emblée, sans attendre le GPS. */
const RECENT_FIX_MAX_AGE_MS = 10 * 60 * 1000;
const RECENT_FIX_TIMEOUT_MS = 1_500;
/** Dernière position connue acceptée quand le GPS ne répond pas (mieux que Paris). */
const OLD_FIX_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const OLD_FIX_TIMEOUT_MS = 3_000;
/** Un écran qui s'ouvre relit la position en silence si elle a plus que cet âge. */
const REFRESH_AFTER_MS = 60_000;
/** En dessous, la position affichée ne bouge pas (évite de recharger pour rien). */
const REFRESH_MIN_METERS = 300;
const REFINE_MIN_METERS = 150;
/** Position refusée ou indisponible : nouvelle tentative discrète au plus toutes les… */
const RETRY_AFTER_MS = 15_000;

let snapshot: LocationSnapshot = { coords: DEFAULT_LOCATION, resolving: true, status: 'loading', city: null };
const listeners = new Set<() => void>();
/** Date du dernier relevé réussi. */
let fixAt = 0;
/** Date de la dernière tentative (réussie ou non). */
let attemptAt = 0;
let inflight: Promise<void> | null = null;

export function getLocationSnapshot(): LocationSnapshot {
  return snapshot;
}

export function subscribeLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(patch: Partial<LocationSnapshot>): void {
  const next = { ...snapshot, ...patch };
  if (
    next.coords === snapshot.coords && next.resolving === snapshot.resolving
    && next.status === snapshot.status && next.city === snapshot.city
  ) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

/** Distance approximative en mètres (équirectangulaire — suffisant sous 50 km). */
export function metersBetween(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** La promesse, ou `null` si elle échoue ou dépasse le délai. Ne rejette jamais. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

function currentPosition(): Promise<Location.LocationObject | null> {
  return within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), POSITION_TIMEOUT_MS);
}

function lastKnown(maxAge: number, timeoutMs: number): Promise<Location.LocationObject | null> {
  return within(Location.getLastKnownPositionAsync({ maxAge }), timeoutMs);
}

/** Géocodage inverse best-effort, en arrière-plan : ne bloque jamais l'écran. */
async function lookupCity(at: Coordinates): Promise<void> {
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude: at.lat, longitude: at.lng });
    const name = geo ? geo.city ?? geo.district ?? geo.region ?? null : null;
    // Réponse tardive pour une position qui n'est plus la nôtre : ignorée.
    if (name && snapshot.coords === at) publish({ city: name });
  } catch {
    // ignoré
  }
}

/** Adopte un relevé. Déjà localisé et déplacement < minMeters : la position ne bouge pas. */
function accept(pos: Location.LocationObject, minMeters: number): void {
  const next: Coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  fixAt = Date.now();
  if (snapshot.status === 'granted' && metersBetween(snapshot.coords, next) < minMeters) {
    publish({ resolving: false });
    return;
  }
  publish({ coords: next, status: 'granted', resolving: false });
  void lookupCity(next);
}

function fail(reason: 'denied' | 'fallback'): void {
  // Un relevé raté ne fait pas perdre une position déjà obtenue ; un refus
  // de permission, si : on ne garde pas une position qu'on n'a plus le droit de lire.
  if (reason === 'fallback' && snapshot.status === 'granted') {
    publish({ resolving: false });
    return;
  }
  publish({ coords: DEFAULT_LOCATION, status: reason, resolving: false, city: null });
}

/** Relevé précis en arrière-plan ; ne remplace la position que si l'on a bougé. */
async function refine(minMeters: number): Promise<void> {
  const pos = await currentPosition();
  if (pos) accept(pos, minMeters);
}

/**
 * Lecture complète.
 * `ask` : demander la permission (sinon on se contente de la lire).
 * `silent` : ne pas repasser les écrans en « recherche » pendant la lecture.
 */
async function resolve(opts: { ask: boolean; silent: boolean }): Promise<void> {
  attemptAt = Date.now();
  if (!opts.silent) publish({ resolving: true, status: 'loading' });
  try {
    const perm = opts.ask
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      fail('denied');
      return;
    }
    // Permission accordée mais localisation coupée dans les réglages
    // (tuile « Localisation » sur Android) : inutile d'attendre le délai.
    if (!(await Location.hasServicesEnabledAsync())) {
      fail('fallback');
      return;
    }
    const recent = await lastKnown(RECENT_FIX_MAX_AGE_MS, RECENT_FIX_TIMEOUT_MS);
    if (recent) {
      accept(recent, 0);
      void refine(REFINE_MIN_METERS);
      return;
    }
    const pos = (await currentPosition()) ?? (await lastKnown(OLD_FIX_MAX_AGE_MS, OLD_FIX_TIMEOUT_MS));
    if (!pos) {
      fail('fallback');
      return;
    }
    accept(pos, 0);
  } catch {
    fail('fallback');
  }
}

function run(task: Promise<void>): Promise<void> {
  const done = task.then(
    () => { if (inflight === done) inflight = null; },
    () => { if (inflight === done) inflight = null; },
  );
  inflight = done;
  return done;
}

/**
 * À appeler quand un écran s'ouvre (ou que l'app revient au premier plan) :
 * première lecture si elle n'a pas eu lieu, relecture discrète sinon.
 */
export function ensureLocation(): void {
  if (inflight) return;
  const now = Date.now();
  if (snapshot.status === 'loading') {
    void run(resolve({ ask: true, silent: false }));
    return;
  }
  if (snapshot.status === 'granted') {
    if (now - fixAt > REFRESH_AFTER_MS) void run(refine(REFRESH_MIN_METERS));
    return;
  }
  // Refusée ou indisponible : on retente sans bruit et sans redemander la
  // permission (l'utilisateur l'a peut-être accordée dans les réglages).
  if (now - attemptAt > RETRY_AFTER_MS) void run(resolve({ ask: false, silent: true }));
}

/** Bouton « Réessayer » : relance tout, demande de permission comprise. */
export function retryLocation(): void {
  if (inflight) return;
  void run(resolve({ ask: true, silent: false }));
}

/**
 * Relit la position sans rien afficher, et ne la remplace que si l'on a
 * bougé d'au moins `minMeters`. Sans demande de permission : une position
 * refusée reste refusée.
 */
export async function refreshIfMoved(minMeters = 500): Promise<void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (snapshot.status !== 'granted') {
      if (!inflight) await run(resolve({ ask: false, silent: true }));
      return;
    }
    await refine(minMeters);
  } catch {
    // Position indisponible : on garde la précédente.
  }
}

/** Tests uniquement : repart d'un état vierge. */
export function __resetLocationStoreForTests(): void {
  snapshot = { coords: DEFAULT_LOCATION, resolving: true, status: 'loading', city: null };
  listeners.clear();
  fixAt = 0;
  attemptAt = 0;
  inflight = null;
}
