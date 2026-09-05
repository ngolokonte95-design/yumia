/**
 * Demande la permission de notifications push, récupère le push token Expo
 * et l'enregistre sur l'API. Doit être appelé une fois, quand l'utilisateur
 * est authentifié.
 *
 * Sur simulateur ou web, `getExpoPushTokenAsync()` peut échouer — on ignore
 * silencieusement pour ne pas bloquer l'UX.
 */
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// Depuis SDK 53, Expo Go sur Android ne supporte plus du tout les
// notifications push distantes — plusieurs fonctions du module (jusqu'à
// setNotificationHandler lui-même selon la version) peuvent lever une
// exception synchrone à ce sujet. `isRunningInExpoGo()` est le même test
// que celui utilisé en interne par expo-notifications pour décider s'il
// faut lever cette exception — on l'utilise pour désactiver tout le module
// proprement dans ce cas précis, plutôt que de risquer un plantage complet
// de l'app au démarrage.
const pushUnsupported = Platform.OS === 'android' && isRunningInExpoGo();

if (!pushUnsupported) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // best-effort — ne jamais empêcher l'app de démarrer pour ça
  }
}

async function registerPushToken(accessToken: string): Promise<void> {
  // Web n'a pas de push natif via Expo ; idem Expo Go sur Android (SDK 53+).
  if (Platform.OS === 'web' || pushUnsupported) return;

  // expo-notifications v56 types extend PermissionResponse from 'expo' which
  // lacks .d.ts exports in this build — cast to extract the shape we need.
  type PermStatus = { granted: boolean; status: string };

  const existing = (await Notifications.getPermissionsAsync()) as unknown as PermStatus;
  if (!existing.granted) {
    const requested = (await Notifications.requestPermissionsAsync()) as unknown as PermStatus;
    if (!requested.granted) return;
  }

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    token = result.data;
  } catch {
    // Simulateur ou environnement sans project ID — on ignore.
    return;
  }

  await fetch(`${API_BASE_URL}/auth/me/push-token`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token }),
  });
}

export function usePushNotifications(accessToken: string | null) {
  const registered = useRef(false);

  useEffect(() => {
    if (!accessToken || registered.current) return;
    registered.current = true;

    registerPushToken(accessToken).catch(() => {
      // best-effort — ne jamais bloquer l'utilisateur
      registered.current = false;
    });
  }, [accessToken]);
}
