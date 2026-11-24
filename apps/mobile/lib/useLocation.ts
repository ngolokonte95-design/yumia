/**
 * Géolocalisation de l'utilisateur avec gestion de permission et repli.
 *
 * - `status` décrit l'état du flux (demande de permission → résolution).
 * - En cas de refus ou d'erreur, on retombe sur `DEFAULT_LOCATION` (Paris) pour
 *   que l'app reste utilisable — le Top 3 fonctionne quand même.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { DEFAULT_LOCATION } from './config';

export type LocationStatus = 'loading' | 'granted' | 'denied' | 'fallback';

export interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationState {
  coords: Coordinates;
  /** `true` tant que la position n'est pas résolue (permission + lecture GPS). */
  resolving: boolean;
  status: LocationStatus;
  /** `true` si l'on utilise le repli au lieu de la position réelle. */
  isFallback: boolean;
  /** Ville résolue par géocodage inverse (null si indisponible). */
  city: string | null;
  retry: () => void;
  /**
   * Relit la position sans rien afficher, et ne la remplace que si l'on a
   * bougé d'au moins `minMeters`. Sans demande de permission : une position
   * refusée reste refusée.
   */
  refreshIfMoved: (minMeters?: number) => Promise<void>;
}

/** Distance approximative en mètres (équirectangulaire — suffisant sous 50 km). */
function metersBetween(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * Lecture de la position bornée dans le temps. Sur Android,
 * `getCurrentPositionAsync` peut ne jamais répondre (intérieur sans Wi-Fi,
 * appareil GPS seul, économiseur d'énergie) : l'onglet Carte restait alors
 * sur son spinner, sans carte ni bouton. Passé le délai, on se rabat sur la
 * dernière position connue du système (souvent à quelques minutes près), et
 * seulement ensuite sur Paris.
 */
const POSITION_TIMEOUT_MS = 8_000;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;

async function readPosition(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('position timeout')), POSITION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
  } catch (err) {
    // Même la dernière position connue peut se faire attendre sur certains
    // Android : on la borne aussi, sinon l'écran restait « en recherche ».
    const last = await Promise.race([
      Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }),
      new Promise<null>((r) => setTimeout(() => r(null), LAST_KNOWN_TIMEOUT_MS)),
    ]);
    if (last) return last;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const LAST_KNOWN_TIMEOUT_MS = 3_000;

/**
 * Dernière position obtenue, partagée par tous les écrans.
 *
 * Chaque écran a son propre `useLocation` : sans ce partage, rouvrir un
 * univers relançait tout (permission, GPS, ville). Sur Android cela prend
 * plusieurs secondes, et la page affichait « Aucun lieu » pendant ce temps
 * (24/11/2026). Une position de moins de {@link SHARED_FIX_MAX_AGE_MS} est
 * reprise telle quelle, puis relue en silence.
 */
const SHARED_FIX_MAX_AGE_MS = 10 * 60 * 1000;
let sharedFix: { coords: Coordinates; city: string | null; at: number } | null = null;

function freshSharedFix() {
  return sharedFix && Date.now() - sharedFix.at < SHARED_FIX_MAX_AGE_MS ? sharedFix : null;
}

export function useLocation(): LocationState {
  const [initialFix] = useState(freshSharedFix);
  const [coords, setCoords] = useState<Coordinates>(initialFix?.coords ?? DEFAULT_LOCATION);
  const [resolving, setResolving] = useState(!initialFix);
  const [status, setStatus] = useState<LocationStatus>(initialFix ? 'granted' : 'loading');
  const [city, setCity] = useState<string | null>(initialFix?.city ?? null);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const resolve = useCallback(async () => {
    setResolving(true);
    setStatus('loading');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setCoords(DEFAULT_LOCATION);
        setStatus('denied');
        return;
      }
      // Permission accordée mais localisation coupée dans les réglages
      // (tuile « Localisation » sur Android) : inutile d'attendre le délai.
      if (!(await Location.hasServicesEnabledAsync())) {
        setCoords(DEFAULT_LOCATION);
        setStatus('fallback');
        return;
      }
      const pos = await readPosition();
      const { latitude, longitude } = pos.coords;
      const next = { lat: latitude, lng: longitude };
      setCoords(next);
      setStatus('granted');
      sharedFix = { coords: next, city: sharedFix?.city ?? null, at: Date.now() };
      // La position suffit aux écrans : on ne les fait plus attendre le nom de
      // la ville. Sur Android, le géocodeur du système met parfois longtemps
      // (voire ne répond pas), et tout l'écran restait bloqué derrière.
      setResolving(false);
      void lookupCity(latitude, longitude);
    } catch {
      setCoords(DEFAULT_LOCATION);
      setStatus('fallback');
    } finally {
      setResolving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Géocodage inverse best-effort, en arrière-plan. */
  const lookupCity = useCallback(async (latitude: number, longitude: number) => {
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const name = geo ? geo.city ?? geo.district ?? geo.region ?? null : null;
      if (name) {
        setCity(name);
        if (sharedFix) sharedFix = { ...sharedFix, city: name };
      }
    } catch {
      // ignored
    }
  }, []);

  const refreshIfMoved = useCallback(async (minMeters = 500) => {
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return;
      const pos = await readPosition();
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const moved = metersBetween(coordsRef.current, next) >= minMeters;
      sharedFix = { coords: moved ? next : coordsRef.current, city: sharedFix?.city ?? null, at: Date.now() };
      if (!moved) return;
      setCoords(next);
      setStatus('granted');
      void lookupCity(next.lat, next.lng);
    } catch {
      // Position indisponible : on garde la précédente.
    }
  }, [lookupCity]);

  useEffect(() => {
    // Position récente déjà connue : affichée tout de suite, relue en silence.
    if (initialFix) {
      void refreshIfMoved(300);
      return;
    }
    void resolve();
  // Une seule fois à l'ouverture de l'écran (les deux fonctions sont stables).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    coords,
    resolving,
    status,
    isFallback: status === 'denied' || status === 'fallback',
    city,
    retry: () => void resolve(),
    refreshIfMoved,
  };
}
