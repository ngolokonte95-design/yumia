import { useEffect } from 'react';
import { AppState, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { colors } from '../theme/tokens';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { OfflineBanner } from '../components/OfflineBanner';
import { usePushNotifications } from '../lib/usePushNotifications';
import { startNotificationListener, startNotificationResponseListener } from '../lib/useNotificationHistory';
import { useDailyDigest } from '../lib/useDailyDigest';
import { initPurchases } from '../lib/purchases';
import { useDeepLinks } from '../lib/useDeepLinks';
import { initSentry } from '../lib/sentry';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Initialize Sentry and RevenueCat once before the first render.
initSentry();
initPurchases();

/**
 * Garde de navigation selon l'état d'authentification + onboarding.
 * - non connecté hors (auth) → /login
 * - connecté dans (auth) → vérification onboarding
 * - connecté, onboarding incomplet → /onboarding
 * - connecté, onboarding complet dans (onboarding) → /
 */
function AuthGate() {
  const { status, user, accessToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  usePushNotifications(accessToken);
  useDailyDigest();
  useDeepLinks();


  useEffect(() => startNotificationListener(), []);
  useEffect(() => startNotificationResponseListener(router.push), [router]);

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (status === 'unauthenticated') {
      if (!inAuthGroup) router.replace('/login');
      return;
    }

    // Authentifié — vérifie si l'onboarding est terminé.
    const onboardingDone = user?.preferences?.onboardingComplete === true;

    if (!onboardingDone && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingDone && (inAuthGroup || inOnboarding)) {
      router.replace('/');
    }
  }, [status, user, segments, router]);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="group" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="group-session" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="search" />
      <Stack.Screen name="place" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="universe" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="surprise" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="plus" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="visits" />
      <Stack.Screen name="join" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

async function checkOtaUpdate() {
  if (!Updates.isEnabled) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // best-effort — ignorer en cas d'erreur réseau ou env dev
  }
}

export default function RootLayout() {
  useEffect(() => {
    void checkOtaUpdate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkOtaUpdate();
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <OfflineBanner />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
