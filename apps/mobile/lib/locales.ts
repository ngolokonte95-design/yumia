/**
 * Liste canonique des langues supportées par YUMIA — source unique utilisée
 * par le sélecteur de langue au premier lancement, le picker des paramètres
 * (LocalePicker) et le sélecteur du profil (edit-profile). Garde tout en
 * cohérence : ajouter une langue ne se fait qu'ici.
 */
export interface LocaleInfo {
  code: string;
  /** Nom en français (paramètres) */
  label: string;
  /** Nom dans sa propre langue (le plus lisible pour un locuteur natif) */
  nativeLabel: string;
  flag: string;
  rtl?: boolean;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'fr', label: 'Français', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'Anglais', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Espagnol', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Portugais', nativeLabel: 'Português', flag: '🇵🇹' },
  { code: 'ar', label: 'Arabe', nativeLabel: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'nl', label: 'Néerlandais', nativeLabel: 'Nederlands', flag: '🇳🇱' },
  { code: 'it', label: 'Italien', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'zh', label: 'Chinois', nativeLabel: '中文', flag: '🇨🇳' },
  { code: 'ru', label: 'Russe', nativeLabel: 'Русский', flag: '🇷🇺' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', flag: '🇮🇳' },
  { code: 'de', label: 'Allemand', nativeLabel: 'Deutsch', flag: '🇩🇪' },
  { code: 'pl', label: 'Polonais', nativeLabel: 'Polski', flag: '🇵🇱' },
  { code: 'sv', label: 'Suédois', nativeLabel: 'Svenska', flag: '🇸🇪' },
];

export function localeInfo(code: string): LocaleInfo | undefined {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}
