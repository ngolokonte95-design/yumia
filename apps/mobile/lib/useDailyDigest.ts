/**
 * useDailyDigest — déclenche une notification locale de soirée quand l'appli
 * passe en arrière-plan après 18h. Limite : une seule fois par jour calendaire.
 * Aide à créer le réflexe YUMIA en fin de journée.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'yumia_digest_last_date';

const MESSAGES = [
  { title: 'Et ce soir ?', body: 'YUMIA a 3 adresses qui t\'attendent. Jette un œil 🌙' },
  { title: 'La soirée commence…', body: 'Découvre ce que YUMIA te suggère pour ce soir ✨' },
  { title: 'Tu cherches une idée ?', body: 'YUMIA a préparé ton Top 3 de ce soir 🏆' },
  { title: 'Bonsoir !', body: 'YUMIA connaît les meilleures adresses de ce soir 🎯' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function hasAlreadyFiredToday(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    return stored === todayStr();
  } catch {
    return false;
  }
}

async function markFiredToday(): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, todayStr());
  } catch { /* best-effort */ }
}

async function scheduleEveningNotification(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();

  // Uniquement entre 18h et 22h30 (l'utilisateur est potentiellement disponible le soir)
  if (hour < 18 || hour >= 23) return;
  if (await hasAlreadyFiredToday()) return;

  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: msg.title, body: msg.body, sound: true },
      trigger: { seconds: 60, repeats: false } as Notifications.TimeIntervalTriggerInput,
    });
    await markFiredToday();
  } catch { /* best-effort */ }
}

export function useDailyDigest(): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasActive = appState.current === 'active';
      const goingBackground = nextState === 'background' || nextState === 'inactive';

      if (wasActive && goingBackground) {
        void scheduleEveningNotification();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);
}
