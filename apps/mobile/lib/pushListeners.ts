/**
 * Écoute des notifications push natives — réception en foreground et tap.
 *
 * L'historique n'est plus stocké localement (SecureStore, par appareil) :
 * le centre de notifications lit maintenant l'historique serveur, persisté
 * par NotificationsService à chaque envoi (voir lib/notifications-api.ts,
 * app/notifications.tsx). Ce fichier ne garde que la plomberie native :
 * rafraîchir le badge à la réception, et naviguer au bon endroit au tap.
 *
 * expo-notifications est chargé à la demande (voir pushAvailability.ts) : un
 * import statique planterait l'app au démarrage sur Expo Go / Android.
 */
import { notificationTarget } from './notificationRouting';
import { refreshUnreadCount } from './useNotifications';
import { loadNotifications } from './pushAvailability';

/** Abonnement résolu de façon asynchrone ; la fonction de nettoyage le retire dès qu'il existe. */
function lazySubscribe(
  subscribe: (n: NonNullable<Awaited<ReturnType<typeof loadNotifications>>>) => { remove: () => void },
): () => void {
  let sub: { remove: () => void } | null = null;
  let cancelled = false;

  void (async () => {
    try {
      const Notifications = await loadNotifications();
      if (!Notifications || cancelled) return;
      sub = subscribe(Notifications);
      // L'écran a pu être démonté pendant le chargement du module.
      if (cancelled) { sub.remove(); sub = null; }
    } catch {
      // best-effort — l'absence de notifications ne doit jamais bloquer l'app
    }
  })();

  return () => { cancelled = true; sub?.remove(); sub = null; };
}

/** À appeler une seule fois (_layout.tsx) — recrée l'écoute si `accessToken` change. */
export function startNotificationListener(accessToken: string | null): () => void {
  return lazySubscribe((Notifications) =>
    Notifications.addNotificationReceivedListener(() => {
      void refreshUnreadCount(accessToken);
    }),
  );
}

/**
 * À appeler une seule fois (_layout.tsx) — navigue au bon endroit quand
 * l'utilisateur tape sur une notification push (app fermée, en fond, ou ouverte).
 */
export function startNotificationResponseListener(
  navigate: (path: string) => void,
): () => void {
  return lazySubscribe((Notifications) =>
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | ({ type?: string } & Record<string, unknown>)
        | undefined;
      navigate(notificationTarget({ type: data?.type ?? 'generic', data }));
    }),
  );
}
