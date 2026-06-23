/**
 * Configuration runtime du mobile.
 *
 * `apiBaseUrl` provient de `app.json > expo.extra.apiBaseUrl` (surchargeable par
 * build/env). Défaut : API locale. Sur un appareil physique, remplacer
 * `localhost` par l'IP LAN de la machine qui sert l'API.
 */
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  googleClientIdWeb?: string;
  googleClientIdIos?: string;
  googleClientIdAndroid?: string;
};

// EXPO_PUBLIC_API_BASE_URL is inlined by Metro at EAS build time (takes priority).
// Falls back to app.json > extra.apiBaseUrl for local dev.
export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  extra.apiBaseUrl ??
  'http://localhost:4000/api';

/** Google OAuth client IDs — renseigner dans app.json > extra ou via EAS secrets. */
export const GOOGLE_CLIENT_IDS = {
  web: extra.googleClientIdWeb ?? '',
  ios: extra.googleClientIdIos ?? '',
  android: extra.googleClientIdAndroid ?? '',
} as const;

/** Position par défaut tant que la géolocalisation n'est pas branchée (centre de Paris). */
export const DEFAULT_LOCATION = { lat: 48.8566, lng: 2.3522 } as const;
