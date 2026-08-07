/**
 * Écoute des notifications push natives — réception en foreground et tap.
 *
 * L'historique n'est plus stocké localement (SecureStore, par appareil) :
 * le centre de notifications lit maintenant l'historique serveur, persisté
 * par NotificationsService à chaque envoi (voir lib/notifications-api.ts,
 * app/notifications.tsx). Ce fichier ne garde que la plomberie native :
 * rafraîchir le badge à la réception, et naviguer au bon endroit au tap.
 */
import * as Notifications from 'expo-notifications';
import { notificationTarget } from './notificationRouting';
import { refreshUnreadCount } from './useNotifications';

/** À appeler une seule fois (_layout.tsx) — recrée l'écoute si `accessToken` change. */
export function startNotificationListener(accessToken: string | null): () => void {
  const sub = Notifications.addNotificationReceivedListener(() => {
    void refreshUnreadCount(accessToken);
  });
  return () => sub.remove();
}

/**
 * À appeler une seule fois (_layout.tsx) — navigue au bon endroit quand
 * l'utilisateur tape sur une notification push (app fermée, en fond, ou ouverte).
 */
export function startNotificationResponseListener(
  navigate: (path: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | ({ type?: string } & Record<string, unknown>)
      | undefined;
    navigate(notificationTarget({ type: data?.type ?? 'generic', data }));
  });
  return () => sub.remove();
}
