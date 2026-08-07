/**
 * Compteur de notifications non lues — source de vérité serveur (voir
 * lib/notifications-api.ts), partagé entre tous les composants qui l'affichent
 * (barre d'onglets, en-tête du profil) sans passer par un Contexte React :
 * un petit pub-sub module-level suffit pour une seule valeur partagée.
 */
import { useEffect, useState } from 'react';
import { notificationsApi } from './notifications-api';

type Listener = () => void;

let unreadCount = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

function setCount(next: number) {
  if (next === unreadCount) return;
  unreadCount = next;
  notify();
}

/**
 * Relit le compteur depuis le serveur — à appeler après connexion, à la
 * réception d'une notif push en foreground, ou après toute action qui peut
 * le faire varier.
 */
export async function refreshUnreadCount(accessToken: string | null): Promise<void> {
  if (!accessToken) { setCount(0); return; }
  try {
    setCount(await notificationsApi.unreadCount(accessToken));
  } catch {
    // réseau KO — on garde la dernière valeur connue plutôt que d'afficher 0
  }
}

/** Remet le badge à zéro tout de suite (optimiste), avant confirmation serveur. */
export function clearUnreadCountLocally(): void {
  setCount(0);
}

/** Lit le compteur ; se met à jour à chaque `refreshUnreadCount()`/`clearUnreadCountLocally()`. */
export function useUnreadNotificationsCount(): number {
  const [count, setLocal] = useState(unreadCount);
  useEffect(() => {
    const listener = () => setLocal(unreadCount);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return count;
}
