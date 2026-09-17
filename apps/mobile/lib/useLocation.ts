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

export function useLocation(): LocationState {
  const [coords, setCoords] = useState<Coordinates>(DEFAULT_LOCATION);
  const [resolving, setResolving] = useState(true);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [city, setCity] = useState<string | null>(null);
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
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lng: longitude });
      setStatus('granted');

      // Géocodage inverse best-effort — ne jamais bloquer l'UX.
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          setCity(geo.city ?? geo.district ?? geo.region ?? null);
        }
      } catch {
        // ignored
      }
    } catch {
      setCoords(DEFAULT_LOCATION);
      setStatus('fallback');
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const refreshIfMoved = useCallback(async (minMeters = 500) => {
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (metersBetween(coordsRef.current, next) < minMeters) return;
      setCoords(next);
      setStatus('granted');
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: next.lat, longitude: next.lng });
        if (geo) setCity(geo.city ?? geo.district ?? geo.region ?? null);
      } catch {
        // ignored
      }
    } catch {
      // Position indisponible : on garde la précédente.
    }
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
