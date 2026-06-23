/**
 * JOIN — écran de jonction via code d'invitation.
 * Arrivée depuis deep link : yumia://join?code=XXXXX
 * Affiche un spinner, appelle POST /groups/join/:code,
 * puis redirige vers group-session avec l'id retourné.
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { joinGroupRequest } from '../lib/groups-api';

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { accessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !accessToken) return;
    joinGroupRequest(accessToken, code)
      .then((session) => {
        // Replace so the back button doesn't return to this join screen.
        router.replace({ pathname: '/group-session', params: { id: session.id } });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Code invalide ou expiré.');
      });
  }, [code, accessToken]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {error ? (
        <>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Oops !</Text>
          <Text style={styles.subtitle}>{error}</Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.subtitle}>Jonction à la session…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emoji: { fontSize: 48 },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
});
