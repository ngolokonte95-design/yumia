/**
 * Diffusion de position en véritable arrière-plan (pour "Tind" / la carte du
 * monde) via expo-location + expo-task-manager, indépendante de tout écran
 * ouvert — contrairement à l'ancien système qui n'envoyait la position que
 * lorsque `world-map.tsx` ou `discover-people.tsx` était monté.
 *
 * La tâche est définie au chargement du module (obligatoire pour que le
 * système d'exploitation puisse la relancer après un redémarrage de l'app),
 * lit le jeton depuis SecureStore (le contexte de tâche de fond n'a pas accès
 * au contexte React), et envoie un PUT /location/me à chaque mise à jour.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_BASE_URL } from './config';
import { loadTokens } from './token-storage';

const TASK_NAME = 'yumia-background-location';

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data as { locations?: Location.LocationObject[] }) ?? {};
  const last = locations?.[locations.length - 1];
  if (!last) return;

  try {
    const tokens = await loadTokens();
    if (!tokens) return;
    await fetch(`${API_BASE_URL}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.accessToken}` },
      body: JSON.stringify({ lat: last.coords.latitude, lng: last.coords.longitude, visibility: 'map' }),
    });
  } catch {
    // Pas de réseau ou serveur indisponible — on retentera à la prochaine mise à jour.
  }
});

/** Démarre le suivi en arrière-plan. Nécessite la permission "toujours autoriser". */
export async function startBackgroundLocation(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;

  const already = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (already) return true;

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 50,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'YUMIA',
      notificationBody: 'Ta position est partagée pour te faire découvrir des membres proches.',
    },
    pausesUpdatesAutomatically: false,
  });
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  const already = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (already) await Location.stopLocationUpdatesAsync(TASK_NAME);
}

export async function isBackgroundLocationActive(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME);
}
