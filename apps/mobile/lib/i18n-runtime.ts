/**
 * Locale courante accessible hors du contexte React — pour les quelques
 * modules non-composants (api.ts, feed-api.ts…) qui doivent traduire un
 * message d'erreur sans pouvoir appeler `useI18n()`. Tenue à jour par
 * `useI18n` à chaque changement de locale (voir son effet).
 */
import { TRANSLATIONS, type TranslationKey } from './translations';

let _locale = 'fr';

export function setRuntimeLocale(locale: string): void {
  _locale = locale;
}

export function getRuntimeLocale(): string {
  return _locale;
}

/** Traduction hors-React — mêmes clés que `useI18n().t`. */
export function tRuntime(key: TranslationKey): string {
  const dict = TRANSLATIONS[_locale] ?? TRANSLATIONS['fr'];
  return dict[key] ?? key;
}
