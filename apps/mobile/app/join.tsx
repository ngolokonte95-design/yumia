/**
 * JOIN — écran de jonction via code d'invitation.
 * Arrivée depuis deep link : yumia://join?code=XXXXX
 *
 * Un lien peut être ouvert sans que l'utilisateur l'ait voulu (lien piégé,
 * redirection web…) : on DEMANDE confirmation (« Rejoindre ce groupe ? »)
 * avant d'appeler POST /groups/join/:code, puis on redirige vers
 * group-session avec l'id retourné.
 */
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { joinGroupRequest } from '../lib/groups-api';
import { useI18n } from '../lib/useI18n';

type Phase = 'confirm' | 'joining' | 'error';

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);

  const cleanCode = typeof code === 'string' ? code.trim() : '';

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const confirm = () => {
    if (!cleanCode || !accessToken || phase === 'joining') return;
    setPhase('joining');
    joinGroupRequest(accessToken, cleanCode)
      .then((session) => {
        // Replace so the back button doesn't return to this join screen.
        router.replace({ pathname: '/group-session', params: { id: session.id } });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('join_invalid_code'));
        setPhase('error');
      });
  };

  const invalid = !cleanCode;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      {phase === 'error' || invalid ? (
        <>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>{t('join_oops')}</Text>
          <Text style={styles.subtitle}>{error ?? t('join_invalid_code')}</Text>
          <Pressable style={styles.secondaryBtn} onPress={leave} accessibilityRole="button">
            <Text style={styles.secondaryTxt}>{t('cancel')}</Text>
          </Pressable>
        </>
      ) : phase === 'joining' ? (
        <>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.subtitle}>{t('join_joining')}</Text>
        </>
      ) : (
        <>
          <Text style={styles.emoji}>👥</Text>
          <Text style={styles.title}>{t('join_confirm_title')}</Text>
          <Text style={styles.subtitle}>{t('join_confirm_body').replace('{code}', cleanCode)}</Text>
          <Pressable
            style={[styles.primaryBtn, !accessToken && styles.disabled]}
            onPress={confirm}
            disabled={!accessToken}
            accessibilityRole="button"
          >
            <Text style={styles.primaryTxt}>{t('group_join_btn')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={leave} accessibilityRole="button">
            <Text style={styles.secondaryTxt}>{t('cancel')}</Text>
          </Pressable>
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
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center', paddingHorizontal: spacing.xl },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    minWidth: 220,
    alignItems: 'center',
  },
  primaryTxt: { ...typography.body, color: '#fff', fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: 'center' },
  secondaryTxt: { ...typography.body, color: colors.textSecondary },
  disabled: { opacity: 0.5 },
});
