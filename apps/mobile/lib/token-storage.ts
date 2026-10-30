/**
 * Stockage sécurisé des jetons (Keychain iOS / Keystore Android via SecureStore).
 * Les jetons ne transitent jamais par un stockage en clair.
 *
 * Lisibles dès le premier déverrouillage après démarrage du téléphone
 * (AFTER_FIRST_UNLOCK), et non plus seulement écran déverrouillé : un appel
 * reçu iPhone verrouillé lance l'app en arrière-plan (CallKit), qui doit
 * retrouver la session pour décrocher. Réglage habituel des messageries.
 *
 * L'accessibilité d'une entrée Keychain ne change pas quand on la met à
 * jour : les jetons vont donc dans un nouveau service, et les anciens
 * (service par défaut) sont repris au premier chargement puis effacés.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from './auth-api';

const ACCESS_KEY = 'yumia.accessToken';
const REFRESH_KEY = 'yumia.refreshToken';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'yumia.session',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function clearLegacy(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {}),
  ]);
}

export async function saveTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken, OPTIONS),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken, OPTIONS),
  ]);
  await clearLegacy();
}

export async function loadTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY, OPTIONS),
    SecureStore.getItemAsync(REFRESH_KEY, OPTIONS),
  ]);
  if (accessToken && refreshToken) return { accessToken, refreshToken };

  // Session enregistrée par une version précédente : on la déplace.
  const [legacyAccess, legacyRefresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!legacyAccess || !legacyRefresh) return null;
  const legacy = { accessToken: legacyAccess, refreshToken: legacyRefresh };
  await saveTokens(legacy).catch(() => {});
  return legacy;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY, OPTIONS),
    SecureStore.deleteItemAsync(REFRESH_KEY, OPTIONS),
  ]);
  await clearLegacy();
}
