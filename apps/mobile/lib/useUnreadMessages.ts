/**
 * Indique s'il existe au moins une conversation non lue (message ou appel —
 * les événements d'appel sont désormais persistés comme des messages, voir
 * CallsService.recordCallEvent côté API), pour afficher un petit point rouge
 * sur l'icône enveloppe (accès aux messages) sans avoir à ouvrir la liste.
 *
 * Même pattern pub-sub module-level que lib/useNotifications.ts.
 */
import { useEffect, useState } from 'react';
import { API_BASE_URL } from './config';

const API = API_BASE_URL;
const POLL_INTERVAL = 20_000;

type Listener = () => void;

let hasUnread = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

function setHasUnread(next: boolean) {
  if (next === hasUnread) return;
  hasUnread = next;
  notify();
}

interface ConversationSummary {
  lastMessage: { createdAt: string } | null;
  lastReadAt: string | null;
}

/** Relit l'état depuis le serveur — à appeler après connexion ou à la réception d'un push. */
export async function refreshUnreadMessages(accessToken: string | null): Promise<void> {
  if (!accessToken) { setHasUnread(false); return; }
  try {
    const res = await fetch(`${API}/chat/conversations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return; // réseau/serveur KO — on garde la dernière valeur connue
    const list: ConversationSummary[] = await res.json();
    setHasUnread(list.some((c) =>
      c.lastMessage && (!c.lastReadAt || new Date(c.lastMessage.createdAt) > new Date(c.lastReadAt)),
    ));
  } catch {
    // réseau KO — on garde la dernière valeur connue plutôt que de faire disparaître le point
  }
}

/** Remet le point à zéro tout de suite (optimiste) — ex. juste après avoir ouvert la liste des messages. */
export function clearUnreadMessagesLocally(): void {
  setHasUnread(false);
}

/** `true` s'il existe un message ou un appel non lu ; se relit toutes les 20s tant qu'un composant l'utilise. */
export function useHasUnreadMessages(accessToken: string | null): boolean {
  const [local, setLocal] = useState(hasUnread);

  useEffect(() => {
    const listener = () => setLocal(hasUnread);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (!accessToken) { setHasUnread(false); return; }
    void refreshUnreadMessages(accessToken);
    const id = setInterval(() => void refreshUnreadMessages(accessToken), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [accessToken]);

  return local;
}
