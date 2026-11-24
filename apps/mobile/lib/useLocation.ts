/**
 * Géolocalisation de l'utilisateur avec gestion de permission et repli.
 *
 * - `status` décrit l'état du flux (demande de permission → résolution).
 * - En cas de refus ou d'erreur, on retombe sur `DEFAULT_LOCATION` (Paris) pour
 *   que l'app reste utilisable — le Top 3 fonctionne quand même.
 *
 * La position est lue UNE fois pour toute l'app (lib/location-store.ts) : un
 * écran qui s'ouvre l'a immédiatement, au lieu de relancer permission + GPS.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  ensureLocation, getLocationSnapshot, refreshIfMoved, retryLocation, subscribeLocation,
} from './location-store';
import type { Coordinates, LocationStatus } from './location-store';

export type { Coordinates, LocationStatus } from './location-store';

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

/** Au retour au premier plan, la position est relue en silence (une seule écoute pour l'app). */
let foregroundHooked = false;
function hookForeground(): void {
  if (foregroundHooked) return;
  foregroundHooked = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') ensureLocation();
  });
}

export function useLocation(): LocationState {
  const snap = useSyncExternalStore(subscribeLocation, getLocationSnapshot, getLocationSnapshot);

  useEffect(() => {
    hookForeground();
    ensureLocation();
  }, []);

  return {
    coords: snap.coords,
    resolving: snap.resolving,
    status: snap.status,
    isFallback: snap.status === 'denied' || snap.status === 'fallback',
    city: snap.city,
    retry: retryLocation,
    refreshIfMoved,
  };
}
