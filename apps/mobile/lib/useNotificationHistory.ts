/**
 * Stocke les notifications push reçues dans SecureStore (max 30).
 * Appeler `startListening()` une fois depuis le layout racine pour capturer
 * toutes les notifications entrantes, même en foreground.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const KEY = 'yumia_notif_history';
const MAX = 30;

export interface StoredNotification {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  read: boolean;
}

async function readNotifications(): Promise<StoredNotification[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredNotification[];
  } catch {
    return [];
  }
}

async function writeNotifications(items: StoredNotification[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(items));
  } catch { }
}

/** Hook de lecture de l'historique des notifications. */
export function useNotificationHistory() {
  const [items, setItems] = useState<StoredNotification[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void readNotifications().then(setItems);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      void writeNotifications(next);
      return next;
    });
  }, []);

  const unreadCount = items.filter((n) => !n.read).length;

  return { items, unreadCount, markAllRead };
}

/** À appeler une seule fois (dans _layout.tsx) pour capturer les notifications. */
export function startNotificationListener() {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const { title, body } = notification.request.content;
    const entry: StoredNotification = {
      id: notification.request.identifier,
      title: title ?? 'YUMIA',
      body: body ?? '',
      receivedAt: new Date().toISOString(),
      read: false,
    };
    void readNotifications().then((prev) => {
      const next = [entry, ...prev.filter((n) => n.id !== entry.id)].slice(0, MAX);
      void writeNotifications(next);
    });
  });
  return () => sub.remove();
}

/**
 * À appeler une seule fois (dans _layout.tsx) pour naviguer quand l'utilisateur
 * tape sur une notification push.
 */
export function startNotificationResponseListener(
  navigate: (path: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string } | undefined;
    switch (data?.type) {
      case 'streak_danger':
        navigate('/(tabs)/passport');
        break;
      case 'daily_digest':
      default:
        navigate('/');
        break;
    }
  });
  return () => sub.remove();
}
