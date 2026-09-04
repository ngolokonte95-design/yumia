/**
 * Hook de traduction YUMIA.
 * Priorité : locale du profil utilisateur connecté > langue choisie sur
 * l'écran de sélection au premier lancement (device-locale, avant connexion)
 * > 'fr' par défaut. RTL : l'arabe bascule automatiquement via I18nManager
 * au montage.
 */
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { useAuth } from './auth-context';
import { TRANSLATIONS, type TranslationKey } from './translations';
import { DEFAULT_LOCALE } from '@yumia/shared';
import { setRuntimeLocale } from './i18n-runtime';
import { getCachedDeviceLocale, loadDeviceLocale } from './device-locale';

export function useI18n() {
  const { user } = useAuth();
  // Initialisé depuis le cache mémoire (synchrone) : si l'écran de sélection
  // de langue vient de tourner dans cette même session, la valeur est déjà
  // là — aucun flash de 'fr' avant l'hydratation depuis le disque ci-dessous.
  const [deviceLocale, setDeviceLocale] = useState<string | null>(getCachedDeviceLocale());

  useEffect(() => {
    if (deviceLocale != null) return;
    let active = true;
    void loadDeviceLocale().then((l) => { if (active && l) setDeviceLocale(l); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locale = (user?.locale ?? deviceLocale ?? DEFAULT_LOCALE) as string;
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS['fr'];

  useEffect(() => {
    const rtl = locale === 'ar';
    if (I18nManager.isRTL !== rtl) {
      I18nManager.forceRTL(rtl);
    }
    setRuntimeLocale(locale);
  }, [locale]);

  function t(key: TranslationKey): string {
    return dict[key] ?? key;
  }

  return { t, locale };
}
