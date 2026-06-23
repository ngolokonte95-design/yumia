/**
 * Hook de traduction YUMIA.
 * Lit la locale depuis le profil utilisateur (ou 'fr' par défaut).
 * RTL : l'arabe bascule automatiquement via I18nManager au montage.
 */
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { useAuth } from './auth-context';
import { TRANSLATIONS, type TranslationKey } from './translations';
import { DEFAULT_LOCALE } from '@yumia/shared';

export function useI18n() {
  const { user } = useAuth();
  const locale = (user?.locale ?? DEFAULT_LOCALE) as string;
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS['fr'];

  useEffect(() => {
    const rtl = locale === 'ar';
    if (I18nManager.isRTL !== rtl) {
      I18nManager.forceRTL(rtl);
    }
  }, [locale]);

  function t(key: TranslationKey): string {
    return dict[key] ?? key;
  }

  return { t, locale };
}
