/**
 * Hook Google OAuth via expo-auth-session.
 * Renvoie { signIn, loading, error } — compatible Expo Go (clientId web)
 * et builds natifs (clientId iOS/Android).
 *
 * Pré-requis : renseigner les clientIds dans app.json > extra ou EAS secrets.
 * Sans clientId configuré, `available` est false et le bouton est masqué.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { googleAuthRequest } from './auth-api';
import { GOOGLE_CLIENT_IDS } from './config';
import { MIN_SIGNUP_AGE, isAgeRequiredError, isTooYoungError } from './age-gate';
import { tRuntime } from './i18n-runtime';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth(onSuccess: (result: Awaited<ReturnType<typeof googleAuthRequest>>) => Promise<void>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Jeton mis de côté quand le serveur réclame une date de naissance : le
   * compte n'existe pas encore, donc cette connexion est en fait une
   * inscription. On garde le jeton pour rejouer l'appel une fois la date
   * saisie, plutôt que de renvoyer l'utilisateur chez Google une seconde fois.
   */
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  /** Date passée à `signIn()`, s'il y en avait déjà une à l'écran. */
  const birthDateRef = useRef<string | undefined>(undefined);

  const configured = Boolean(GOOGLE_CLIENT_IDS.web || GOOGLE_CLIENT_IDS.ios || GOOGLE_CLIENT_IDS.android);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_IDS.web || undefined,
    iosClientId: GOOGLE_CLIENT_IDS.ios || "not-configured",
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
  });

  const exchange = useCallback(
    async (idToken: string, birthDate?: string) => {
      setLoading(true);
      setError(null);
      try {
        await onSuccess(await googleAuthRequest(idToken, birthDate));
        setPendingToken(null);
      } catch (err) {
        if (isAgeRequiredError(err)) {
          // Pas une erreur à afficher : une étape de plus à franchir.
          setPendingToken(idToken);
        } else if (isTooYoungError(err)) {
          setPendingToken(null);
          setError(tRuntime('age_gate_denied_body').replace('{n}', String(MIN_SIGNUP_AGE)));
        } else {
          setError(err instanceof Error ? err.message : 'Connexion Google échouée.');
        }
      } finally {
        setLoading(false);
      }
    },
    // onSuccess est stable (useCallback dans AuthProvider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    void exchange(idToken, birthDateRef.current);
  }, [response, exchange]);

  return {
    available: configured && Boolean(request),
    /** `birthDate` si l'écran la connaît déjà (inscription par email). */
    signIn: (birthDate?: string) => {
      birthDateRef.current = birthDate;
      void promptAsync();
    },
    loading,
    error,
    /** Le serveur attend une date de naissance avant de créer le compte. */
    needsAge: pendingToken !== null,
    submitBirthDate: (birthDate: string) => {
      if (pendingToken) void exchange(pendingToken, birthDate);
    },
    cancelAge: () => setPendingToken(null),
  };
}
