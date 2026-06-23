/**
 * Géolocalisation de l'utilisateur avec gestion de permission et repli.
 *
 * - `status` décrit l'état du flux (demande de permission → résolution).
 * - En cas de refus ou d'erreur, on retombe sur `DEFAULT_LOCATION` (Paris) pour
 *   que l'app reste utilisable — le Top 3 fonctionne quand même.
 */
import { useCallback, useEffect, useState } from 'react';
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
}

export function useLocation(): LocationState {
  const [coords, setCoords] = useState<Coordinates>(DEFAULT_LOCATION);
  const [resolving, setResolving] = useState(true);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [city, setCity] = useState<string | null>(null);

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

  return {
    coords,
    resolving,
    status,
    isFallback: status === 'denied' || status === 'fallback',
    city,
    retry: () => void resolve(),
  };
}
