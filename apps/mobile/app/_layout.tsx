import { useEffect, useState } from 'react';
import { AppState, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Updates from 'expo-updates';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../theme/tokens';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { OfflineBanner } from '../components/OfflineBanner';
import { usePushNotifications } from '../lib/usePushNotifications';
import { startNotificationListener, startNotificationResponseListener } from '../lib/pushListeners';
import { refreshUnreadCount } from '../lib/useNotifications';
import { useDailyDigest } from '../lib/useDailyDigest';
import { initPurchases } from '../lib/purchases';
import { useDeepLinks } from '../lib/useDeepLinks';
import { initSentry } from '../lib/sentry';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Initialize Sentry and RevenueCat once before the first render.
initSentry();
initPurchases();

// Garde le splash natif visible tant qu'AuthGate n'a pas déterminé et appliqué
// la bonne route de démarrage. Sans ça, le splash se cache dès le premier
// rendu JS (avant que l'auth soit résolue) et on voit brièvement le dernier
// écran mis en cache par l'OS avant que la vraie route (Home, login…) prenne
// sa place — perçu comme "une page qui apparaît et disparaît".
void SplashScreen.preventAutoHideAsync().catch(() => null);

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
  const [routeReady, setRouteReady] = useState(false);

  usePushNotifications(accessToken);
  useDailyDigest();
  useDeepLinks();


  useEffect(() => { void refreshUnreadCount(accessToken); }, [accessToken]);
  useEffect(() => startNotificationListener(accessToken), [accessToken]);
  useEffect(() => startNotificationResponseListener((path) => router.push(path as never)), [router]);

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (status === 'unauthenticated') {
      if (!inAuthGroup) router.replace('/login');
      setRouteReady(true);
      return;
    }

    // Authentifié — vérifie si l'onboarding est terminé.
    const onboardingDone = user?.preferences?.onboardingComplete === true;

    // Chemins de GROUPE explicites : '/' est ambigu entre (tabs)/index et
    // (onboarding)/index → expo-router peut renvoyer à l'onboarding. On cible
    // donc explicitement chaque groupe.
    if (!onboardingDone && !inOnboarding) {
      router.replace('/(onboarding)');
    } else if (onboardingDone && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
    setRouteReady(true);
  }, [status, user, segments, router]);

  // Cache le splash natif seulement une fois la route finale déterminée (et
  // laissée le temps de peindre), pas dès le premier rendu JS.
  useEffect(() => {
    if (!routeReady) return;
    const id = requestAnimationFrame(() => { void SplashScreen.hideAsync().catch(() => null); });
    return () => cancelAnimationFrame(id);
  }, [routeReady]);

  // Le Stack doit rester monté dès que le statut est connu (sinon
  // router.replace() ci-dessus s'exécute sans navigateur monté) : le rendu
  // "intermédiaire" avant que routeReady ne soit vrai reste invisible car le
  // splash natif recouvre encore tout l'écran à ce moment-là.
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
      {/* Ces trois écrans ne sont jamais atteints par une navigation voulue par
          l'utilisateur — AuthGate y redirige automatiquement via router.replace
          au démarrage. Avec l'animation par défaut, ce replace jouait un slide
          visible (l'écran sortant glissait à gauche pendant que le nouveau
          arrivait), perçu comme "une page qui apparaît et disparaît". */}
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
      <Stack.Screen name="(onboarding)" options={{ animation: 'none' }} />
      <Stack.Screen name="(premium)" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="group" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="group-session" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="search" />
      <Stack.Screen name="place" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="universe" />
      <Stack.Screen name="weather" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="favorites" />
      <Stack.Screen name="calendar" />
      <Stack.Screen name="notebook" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="surprise" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="plus" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="guides" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="sorties" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="nightclub" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="visits" />
      <Stack.Screen name="story-viewer" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="story" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="join" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="admin" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="social-profile" />
      <Stack.Screen name="edit-social-profile" />
      <Stack.Screen name="reels" options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="camera" options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="follow-requests" />
      <Stack.Screen name="memories" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="call" options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
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
      {/* Requis par react-native-gesture-handler : doit envelopper toute l'app
          et porter flex:1, sinon les gestes ne sont pas captés. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
          <OfflineBanner />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
