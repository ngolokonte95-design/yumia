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

// Hors développement, l'API DOIT être en https : jetons, mots de passe et
// positions transiteraient sinon en clair. Mieux vaut un build qui plante au
// démarrage (visible dès le premier test) qu'un build qui fuit en silence.
// Les profils EAS preview/production fixent EXPO_PUBLIC_API_BASE_URL en https.
// (`typeof` : __DEV__ n'existe pas sous jest/node, où ce module est aussi chargé.)
if (typeof __DEV__ !== 'undefined' && !__DEV__ &&!/^https:\/\//i.test(API_BASE_URL)) {
  throw new Error(`[config] API_BASE_URL doit être en https hors développement (reçu : ${API_BASE_URL}).`);
}

/** Google OAuth client IDs — renseigner dans app.json > extra ou via EAS secrets. */
export const GOOGLE_CLIENT_IDS = {
  web: extra.googleClientIdWeb ?? '',
  ios: extra.googleClientIdIos ?? '',
  android: extra.googleClientIdAndroid ?? '',
} as const;

/** Position par défaut tant que la géolocalisation n'est pas branchée (centre de Paris). */
export const DEFAULT_LOCATION = { lat: 48.8566, lng: 2.3522 } as const;

/**
 * Serveur TURN (relais WebRTC) — nécessaire en complément du STUN pour que les
 * appels vocaux/vidéo fonctionnent derrière un NAT symétrique (fréquent en 4G/5G).
 * Auto-hébergé (coturn) sur le VPS de production.
 */
export const TURN_SERVER = {
  url: (process.env.EXPO_PUBLIC_TURN_URL as string | undefined) ?? '',
  username: (process.env.EXPO_PUBLIC_TURN_USERNAME as string | undefined) ?? '',
  credential: (process.env.EXPO_PUBLIC_TURN_CREDENTIAL as string | undefined) ?? '',
} as const;
