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
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { notificationTarget } from './notificationRouting';
import { refreshUnreadCount } from './useNotifications';

// Voir usePushNotifications.ts : Expo Go sur Android (SDK 53+) ne supporte
// plus du tout les notifications push distantes — mieux vaut ne pas
// appeler ces API dans ce cas plutôt que risquer une exception non
// rattrapable au montage de l'app.
const pushUnsupported =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** À appeler une seule fois (_layout.tsx) — recrée l'écoute si `accessToken` change. */
export function startNotificationListener(accessToken: string | null): () => void {
  if (pushUnsupported) return () => {};
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
  if (pushUnsupported) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | ({ type?: string } & Record<string, unknown>)
      | undefined;
    navigate(notificationTarget({ type: data?.type ?? 'generic', data }));
  });
  return () => sub.remove();
}
