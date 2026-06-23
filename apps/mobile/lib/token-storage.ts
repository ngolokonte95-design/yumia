/**
 * Stockage sécurisé des jetons (Keychain iOS / Keystore Android via SecureStore).
 * Les jetons ne transitent jamais par un stockage en clair.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from './auth-api';

const ACCESS_KEY = 'yumia.accessToken';
const REFRESH_KEY = 'yumia.refreshToken';

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function loadTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
