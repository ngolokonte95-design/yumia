/**
 * Chargement protégé d'expo-notifications.
 *
 * Depuis SDK 53, Expo Go sur Android ne supporte plus les notifications push
 * distantes. Le piège : ce n'est PAS seulement l'appel des fonctions qui
 * échoue, c'est l'IMPORT MÊME du module. expo-notifications exécute au
 * chargement un module d'auto-enregistrement (`DevicePushTokenAutoRegistration.fx`)
 * qui appelle `addPushTokenListener()` au niveau global, sans try/catch —
 * et cette fonction lève l'exception « Android Push notifications ... was
 * removed from Expo Go ». Un simple `import * as Notifications from
 * 'expo-notifications'` en tête de fichier suffit donc à planter toute
 * l'application au démarrage, avant que la moindre garde de notre code ne
 * puisse s'exécuter.
 *
 * D'où ce module : le vrai import n'a lieu qu'à la demande (`await import`),
 * et jamais du tout quand l'environnement ne le supporte pas.
 */
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/** `true` quand les notifications push ne peuvent pas fonctionner ici du tout. */
export const pushUnsupported = Platform.OS === 'android' && isRunningInExpoGo();

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * Charge expo-notifications à la demande, ou renvoie `null` si l'environnement
 * ne le supporte pas (Expo Go Android) ou si le chargement échoue.
 */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (pushUnsupported) return null;
  if (cached !== undefined) return cached;
  try {
    cached = await import('expo-notifications');
  } catch {
    cached = null;
  }
  return cached;
}
