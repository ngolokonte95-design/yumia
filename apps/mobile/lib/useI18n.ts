/**
 * Hook de traduction YUMIA.
 * Priorité : locale du profil utilisateur connecté > langue choisie sur
 * l'écran de sélection au premier lancement (device-locale, avant connexion)
 * > 'fr' par défaut. RTL : l'arabe bascule automatiquement via I18nManager
 * au montage.
 */
import { useCallback, useEffect, useState } from 'react';
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

  // Mémoïsé sur `dict` (donc sur `locale`), pas recréé à chaque rendu : sans
  // ça, `t` change de référence à chaque render, et tout code qui le met
  // dans un tableau de dépendances (ex. un useCallback de fetch) se
  // redéclenche en boucle infinie à chaque nouveau rendu déclenché par sa
  // propre réponse — vu en prod sur "Mes visites" (ThrottlerException:
  // Too Many Requests, des dizaines d'appels en rafale).
  const t = useCallback((key: TranslationKey): string => dict[key] ?? key, [dict]);

  return { t, locale };
}
