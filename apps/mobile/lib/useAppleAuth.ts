/**
 * Hook Apple Sign-In via expo-apple-authentication.
 * Disponible uniquement sur iOS 13+. Sur Android/Web, `available` est false.
 *
 * Apple donne le fullName et l'email seulement au PREMIER login — les suivants
 * retournent null. Le backend doit tolérer un email manquant (utilise l'appleId sub).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { appleAuthRequest } from './auth-api';
import { MIN_SIGNUP_AGE, isAgeRequiredError, isTooYoungError } from './age-gate';
import { tRuntime } from './i18n-runtime';

export function useAppleAuth(
  onSuccess: (result: Awaited<ReturnType<typeof appleAuthRequest>>) => Promise<void>,
) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Identifiants mis de côté quand le serveur réclame une date de naissance :
   * ce n'est pas une reconnexion mais une création. On rejoue l'appel avec la
   * date plutôt que de relancer tout le parcours Apple.
   */
  const [pending, setPending] = useState<
    { identityToken: string; user: string; displayName?: string } | null
  >(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        setAvailable(ok);
        // Sur iOS, `false` signifie presque toujours que le module natif Apple
        // n'est pas embarqué dans l'app hôte (cas d'Expo Go), pas que
        // l'appareil ne le supporte pas — le bouton est alors masqué sans
        // aucune erreur visible, ce qui est très déroutant au test.
        if (!ok && __DEV__) {
          console.warn(
            '[useAppleAuth] Sign in with Apple indisponible sur cet appareil iOS. '
            + "Attendu dans Expo Go (module natif non embarqué) ; le bouton s'affichera dans un vrai build.",
          );
        }
      })
      .catch(() => setAvailable(false));
  }, []);

  /** Échange les identifiants Apple contre une session YUMIA. */
  async function exchange(
    credentials: { identityToken: string; user: string; displayName?: string },
    birthDate?: string,
  ) {
    setLoading(true);
    setError(null);
    try {
      const result = await appleAuthRequest(
        credentials.identityToken,
        credentials.user,
        credentials.displayName,
        birthDate,
      );
      await onSuccess(result);
      setPending(null);
    } catch (err) {
      if (isAgeRequiredError(err)) {
        setPending(credentials);
      } else if (isTooYoungError(err)) {
        setPending(null);
        setError(tRuntime('age_gate_denied_body').replace('{n}', String(MIN_SIGNUP_AGE)));
      } else {
        setError(err instanceof Error ? err.message : 'Connexion Apple échouée.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function signIn(birthDate?: string) {
    setError(null);
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign-In : token absent.');
      }

      const displayName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName]
            .filter(Boolean)
            .join(' ')
            .trim()
        : undefined;

      await exchange(
        {
          identityToken: credential.identityToken,
          user: credential.user,
          displayName: displayName || undefined,
        },
        birthDate,
      );
    } catch (err: unknown) {
      // L'utilisateur a annulé — pas une erreur à afficher
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Connexion Apple échouée.');
    } finally {
      setLoading(false);
    }
  }

  return {
    available,
    signIn,
    loading,
    error,
    /** Le serveur attend une date de naissance avant de créer le compte. */
    needsAge: pending !== null,
    submitBirthDate: (birthDate: string) => {
      if (pending) void exchange(pending, birthDate);
    },
    cancelAge: () => setPending(null),
  };
}
