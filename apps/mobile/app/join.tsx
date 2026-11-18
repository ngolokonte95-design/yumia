/**
 * JOIN — écran de jonction via code d'invitation.
 * Arrivée depuis deep link : yumia://join?code=XXXXX
 *
 * Un lien peut être ouvert sans que l'utilisateur l'ait voulu (lien piégé,
 * redirection web…) : on DEMANDE confirmation (« Rejoindre ce groupe ? »)
 * avant d'appeler POST /groups/join/:code, puis on redirige vers
 * group-session avec l'id retourné.
 *
 * Habillage sobre (18/11/2026) : médaillon de verre, typographie forte ; seul
 * accent de couleur : le bouton « Rejoindre ».
 */
import { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { joinGroupRequest } from '../lib/groups-api';
import { useI18n } from '../lib/useI18n';
import { Reveal } from '../components/ui';
import { QUIET_GLASS, SPINNER_COLOR } from '../components/pb2/Pb2Chrome';


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
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      {phase === 'error' || invalid ? (
        <Reveal style={styles.block}>
          <View style={[styles.medal, QUIET_GLASS]}><Text style={styles.emoji}>⚠️</Text></View>
          <Text style={styles.title}>{t('join_oops')}</Text>
          <Text style={styles.subtitle}>{error ?? t('join_invalid_code')}</Text>
          <Pressable style={[styles.secondaryBtn, QUIET_GLASS]} onPress={leave} accessibilityRole="button">
            <Text style={styles.secondaryTxt}>{t('cancel')}</Text>
          </Pressable>
        </Reveal>
      ) : phase === 'joining' ? (
        <View style={styles.block}>
          <ActivityIndicator color={SPINNER_COLOR} size="large" />
          <Text style={styles.subtitle}>{t('join_joining')}</Text>
        </View>
      ) : (
        <Reveal style={styles.block}>
          <View style={[styles.medal, QUIET_GLASS]}><Text style={styles.emoji}>👥</Text></View>
          <Text style={styles.title}>{t('join_confirm_title')}</Text>
          <Text style={styles.subtitle}>{t('join_confirm_body').replace('{code}', cleanCode)}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, !accessToken && styles.disabled, pressed && styles.pressed]}
            onPress={confirm}
            disabled={!accessToken}
            accessibilityRole="button"
          >
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
            <Text style={styles.primaryTxt}>{t('group_join_btn')}</Text>
          </Pressable>
          <Pressable style={styles.quietBtn} onPress={leave} accessibilityRole="button">
            <Text style={styles.secondaryTxt}>{t('cancel')}</Text>
          </Pressable>
        </Reveal>
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
  },
  block: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  medal: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emoji: { fontSize: 42 },
  title: {
    color: colors.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.6,
    textAlign: 'center', paddingHorizontal: spacing.xl,
  },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.xl },
  primaryBtn: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    minWidth: 240,
    alignItems: 'center',
    ...elevation.glowBrand,
  },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    marginTop: spacing.sm, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xl,
    minWidth: 240, alignItems: 'center',
  },
  quietBtn: { paddingVertical: 12, paddingHorizontal: spacing.xl, minWidth: 240, alignItems: 'center' },
  secondaryTxt: { ...typography.body, color: colors.textSecondary, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
