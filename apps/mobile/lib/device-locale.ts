/**
 * Langue choisie sur l'écran de sélection au tout premier lancement — avant
 * même la connexion. Persistée localement (AsyncStorage, pas de compte requis)
 * pour que login/register/etc. s'affichent déjà dans la bonne langue avant
 * qu'un `User.locale` serveur n'existe. Une fois connecté, `user.locale`
 * prend le relais (voir `useI18n`) ; `register()` synchronise ce choix vers
 * le serveur juste après la création du compte (voir auth-context.tsx).
 *
 * `_cached` est tenu à jour de façon synchrone dès `saveDeviceLocale()`, pour
 * qu'un `getCachedDeviceLocale()` immédiatement après (ex. juste avant de
 * naviguer vers /login) renvoie la bonne valeur sans attendre l'AsyncStorage —
 * zéro flash de la langue par défaut sur l'écran suivant.
 */
let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

const KEY = '@yumia/device-locale';

let _cached: string | null | undefined; // undefined = pas encore chargé depuis le disque

/** Charge (une fois) la langue choisie depuis le disque. `null` si jamais choisie. */
export async function loadDeviceLocale(): Promise<string | null> {
  if (_cached !== undefined) return _cached;
  if (!AsyncStorage) { _cached = null; return null; }
  try {
    _cached = await AsyncStorage.getItem(KEY);
  } catch {
    _cached = null;
  }
  return _cached;
}

/** Valeur déjà chargée en mémoire, sans I/O — `null` si pas encore chargée ou jamais choisie. */
export function getCachedDeviceLocale(): string | null {
  return _cached ?? null;
}

export async function saveDeviceLocale(locale: string): Promise<void> {
  _cached = locale; // synchrone d'abord — voir doc du module
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.setItem(KEY, locale);
  } catch {
    // best-effort — au pire, le choix ne survit pas à un redémarrage de l'app
  }
}
