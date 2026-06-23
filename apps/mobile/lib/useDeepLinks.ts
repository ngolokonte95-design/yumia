import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useAuth } from './auth-context';

/**
 * Handles incoming deep links for the app.
 *
 * Supported schemes:
 *   yumia://join?code=XXXXX      → Join a group session by invite code
 *   yumia://place?id=UUID        → Open a place detail screen
 *   yumia://reset-password?token=XXX → Password reset (from email link)
 *
 * When the user is not yet authenticated, the target URL is saved and
 * processed once authentication succeeds.
 */
export function useDeepLinks() {
  const router = useRouter();
  const { status } = useAuth();
  const pendingUrl = useRef<string | null>(null);

  const handleUrl = (url: string | null) => {
    if (!url) return;

    const parsed = Linking.parse(url);
    const { hostname, path, queryParams } = parsed;
    const routeName = hostname ?? path?.replace(/^\//, '');

    if (routeName === 'join' && queryParams?.code) {
      const code = String(queryParams.code);
      if (status === 'authenticated') {
        router.push({ pathname: '/join', params: { code } });
      } else {
        pendingUrl.current = url;
      }
      return;
    }

    if (routeName === 'place' && queryParams?.id) {
      const id = String(queryParams.id);
      if (status === 'authenticated') {
        router.push({ pathname: '/place', params: { id } });
      } else {
        pendingUrl.current = url;
      }
      return;
    }

    if (routeName === 'reset-password' && queryParams?.token) {
      router.push({ pathname: '/reset-password', params: { token: String(queryParams.token) } });
    }
  };

  // Process any pending URL once the user authenticates.
  useEffect(() => {
    if (status === 'authenticated' && pendingUrl.current) {
      handleUrl(pendingUrl.current);
      pendingUrl.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Handle the initial URL (app opened via deep link while cold-started).
  useEffect(() => {
    Linking.getInitialURL().then(handleUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle URLs received while the app is already running (foreground).
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}
