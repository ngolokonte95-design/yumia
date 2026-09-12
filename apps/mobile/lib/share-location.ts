/**
 * Diffusion de position pour la carte sociale — **uniquement pendant que
 * l'écran est ouvert**.
 *
 * Ce module remplace `background-location.ts`, qui diffusait la position même
 * app fermée (expo-task-manager + permission « toujours autoriser »). Cette
 * permission est la plus surveillée des deux boutiques : Google exige un
 * formulaire de déclaration et une vidéo de démonstration, pour une
 * fonctionnalité réservée aux abonnés — donc à presque personne au lancement.
 * Le risque de refus ne valait pas ce qu'elle apportait.
 *
 * Ce qui reste : tant que la carte est ouverte, la position est envoyée à
 * chaque déplacement notable. Ce qui disparaît : la mise à jour téléphone
 * verrouillé. Le serveur garde la dernière position **10 minutes**
 * (`TTL_SECONDS` dans `location.service.ts`), donc on reste visible un moment
 * après avoir quitté l'écran, puis on s'efface — sans laisser une position
 * périmée sur la carte des autres.
 */
import * as Location from 'expo-location';
import { API_BASE_URL } from './config';

/** Mêmes réglages que l'ancienne tâche de fond : 30 s ou 50 m. */
const TIME_INTERVAL_MS = 30_000;
const DISTANCE_INTERVAL_M = 50;

async function pushLocation(accessToken: string, lat: number, lng: number): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ lat, lng, visibility: 'map' }),
    });
  } catch {
    // Pas de réseau : la prochaine mise à jour réessaiera.
  }
}

/** Efface la position côté serveur (l'utilisateur redevient invisible). */
export async function stopSharingLocation(accessToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ visibility: 'off', lat: 0, lng: 0 }),
    });
  } catch {
    // Sans réseau, le TTL de 10 minutes finira le travail.
  }
}

/**
 * Démarre la diffusion et renvoie la fonction pour l'arrêter, ou `null` si la
 * localisation est refusée.
 *
 * L'appelant DOIT appeler la fonction rendue en quittant l'écran : une
 * souscription `watchPositionAsync` laissée ouverte continue de consommer la
 * batterie même écran démonté.
 */
export async function startSharingLocation(
  accessToken: string,
): Promise<(() => void) | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: TIME_INTERVAL_MS,
      distanceInterval: DISTANCE_INTERVAL_M,
    },
    (loc) => void pushLocation(accessToken, loc.coords.latitude, loc.coords.longitude),
  );

  return () => subscription.remove();
}
