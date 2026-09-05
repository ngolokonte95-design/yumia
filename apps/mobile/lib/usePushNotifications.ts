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
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL } from './config';

// Depuis SDK 53, Expo Go sur Android ne supporte plus du tout les
// notifications push distantes — même appeler setNotificationHandler()
// lève une exception non rattrapable (pas seulement getExpoPushTokenAsync,
// qui elle était déjà protégée plus bas). Il faut un vrai build de
// développement pour tester cette fonctionnalité sur Android ; en attendant,
// on désactive proprement tout le module dans Expo Go plutôt que de planter
// l'app entière au démarrage.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const pushUnsupported = Platform.OS === 'android' && isExpoGo;

if (!pushUnsupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
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
