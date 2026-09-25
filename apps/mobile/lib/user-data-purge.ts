/**
 * Purge des données locales propres au compte, appelée à la déconnexion.
 *
 * Sans elle, un second compte connecté sur le même téléphone héritait du
 * cache du premier (passeport, lieux enregistrés…), de ses souvenirs photo,
 * de son historique de recherche et de ses compteurs de quota.
 *
 * Ce qui est volontairement GARDÉ (niveau appareil, ou déjà rangé par compte) :
 *  - `@yumia/tips-seen`           — astuces déjà vues (appareil) ;
 *  - `@yumia/device-locale`       — langue choisie au premier lancement ;
 *  - `@yumia/map_search_radius_km`— réglage d'affichage de la carte ;
 *  - `yumia.aiConsent.v1.<id>`    — consentement IA, déjà clé par utilisateur ;
 *  - `yumia_digest_last_date`, `yumia_visit_count_for_review`,
 *    `yumia_review_asked`         — rythme des notifications / avis (appareil) ;
 *  - `yumia_e2e_priv_v1` / `_pub_v1` — paire de clés E2E : l'effacer rendrait
 *    illisibles les messages chiffrés déjà reçus sur cet appareil.
 * Les jetons eux-mêmes sont effacés par `clearTokens()` (token-storage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** Préfixes AsyncStorage des données propres au compte. */
const USER_ASYNC_PREFIXES = [
  '@yumia/cache/', // cache SWR : passport:me, passport-stats:me, saved:ids, feed…
  'usage:', // compteurs de quota (usePlanLimits)
];

/** Clés AsyncStorage exactes propres au compte. */
const USER_ASYNC_KEYS = [
  'yumia:memories', // souvenirs photo (app/camera.tsx, app/memories.tsx)
];

/** Clés SecureStore propres au compte. */
const USER_SECURE_KEYS = [
  'yumia_search_history', // useSearchHistory
];

/** Vrai si la clé AsyncStorage appartient au compte connecté. */
export function isUserScopedKey(key: string): boolean {
  return USER_ASYNC_KEYS.includes(key) || USER_ASYNC_PREFIXES.some((p) => key.startsWith(p));
}

/** Efface les données locales du compte. Best-effort : ne rejette jamais. */
export async function purgeUserData(): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const toRemove = all.filter(isUserScopedKey);
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // Repli : au moins les clés exactes connues.
    await Promise.all(USER_ASYNC_KEYS.map((k) => AsyncStorage.removeItem(k).catch(() => {})));
  }
  await Promise.all(USER_SECURE_KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => {})));
}
