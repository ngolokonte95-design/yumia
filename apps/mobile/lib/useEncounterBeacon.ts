/**
 * Position « Rencontres » — envoyée tant que l'app est au premier plan, quel
 * que soit l'écran, pour les membres qui ont activé les Rencontres.
 *
 * Distincte du partage sur la carte (`share-location.ts`) : elle ne sert qu'à
 * détecter les croisements côté serveur et n'apparaît ni sur la carte ni dans
 * « à proximité ». Rien n'est envoyé app fermée ou en arrière-plan — pas de
 * permission « toujours autoriser », celle que les boutiques surveillent le
 * plus — et rien si la localisation n'a pas déjà été accordée : ce hook ne
 * demande jamais la permission, le réglage Rencontres le fait à l'activation.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { API_BASE_URL } from './config';

/** Une position toutes les 3 minutes : assez pour se croiser, sobre en batterie. */
const INTERVAL_MS = 3 * 60 * 1000;

async function sendOnce(accessToken: string): Promise<void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await fetch(`${API_BASE_URL}/location/encounter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    });
  } catch {
    // Pas de réseau ou de GPS : la prochaine tentative suffira.
  }
}

export function useEncounterBeacon(accessToken: string | null, enabled: boolean): void {
  useEffect(() => {
    if (!accessToken || !enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void sendOnce(accessToken);
      timer = setInterval(() => void sendOnce(accessToken), INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [accessToken, enabled]);
}
