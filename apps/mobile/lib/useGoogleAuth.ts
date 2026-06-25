/**
 * Hook Google OAuth via expo-auth-session.
 * Renvoie { signIn, loading, error } — compatible Expo Go (clientId web)
 * et builds natifs (clientId iOS/Android).
 *
 * Pré-requis : renseigner les clientIds dans app.json > extra ou EAS secrets.
 * Sans clientId configuré, `available` est false et le bouton est masqué.
 */
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { googleAuthRequest } from './auth-api';
import { GOOGLE_CLIENT_IDS } from './config';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth(onSuccess: (result: Awaited<ReturnType<typeof googleAuthRequest>>) => Promise<void>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(GOOGLE_CLIENT_IDS.web || GOOGLE_CLIENT_IDS.ios || GOOGLE_CLIENT_IDS.android);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_IDS.web || undefined,
    iosClientId: GOOGLE_CLIENT_IDS.ios || "not-configured",
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;

    setLoading(true);
    setError(null);
    googleAuthRequest(idToken)
      .then(onSuccess)
      .catch((err) => setError(err instanceof Error ? err.message : 'Connexion Google échouée.'))
      .finally(() => setLoading(false));
    // onSuccess est stable (useCallback dans AuthProvider)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    available: configured && Boolean(request),
    signIn: () => void promptAsync(),
    loading,
    error,
  };
}
