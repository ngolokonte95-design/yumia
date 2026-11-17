/**
 * RESET PASSWORD — saisie du code OTP + nouveau mot de passe.
 * Mise en scène (17/11/2026) : fond spatial, médaillon de marque, panneau de
 * verre, une seule couleur d'accent.
 */
import { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import { resetPasswordRequest } from '../lib/auth-api';
import { useI18n } from '../lib/useI18n';
import { Reveal } from '../components/ui';
import {
  BrandButton, BrandMedal, ErrorBanner, FieldLabel, GlassBackButton, GlassInput, GlassPanel,
  GlassPasswordInput, HeroTitle, SPACE_BLACK, SpaceBackdrop, TextLink,
} from '../components/auth/AuthChrome';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const passwordRef = useRef<TextInputInstance>(null);

  // L'e-mail vient de l'écran précédent ; saisi ici si on arrive par un lien.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordMatch = password === confirm;
  const canSubmit =
    email.includes('@') &&
    code.trim().length === 6 &&
    password.length >= 8 &&
    passwordMatch &&
    !loading;

  async function handleReset() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await resetPasswordRequest(email.trim().toLowerCase(), code.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('rp_error_generic'));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={styles.root}>
        <SpaceBackdrop />
        <View style={[styles.successBox, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
          <BrandMedal emoji="✅" size={96} />
          <Reveal index={1}>
            <HeroTitle title={t('rp_success_title')} subtitle={t('rp_success_sub')} center />
          </Reveal>
          <Reveal index={2} style={styles.successBtn}>
            <BrandButton label={t('rp_login_btn')} onPress={() => router.replace('/(auth)/login')} />
          </Reveal>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SpaceBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GlassBackButton onPress={() => router.back()} />

          <View style={styles.content}>
            <BrandMedal emoji="🔐" />
            <Reveal index={1}>
              <HeroTitle title={t('rp_title')} subtitle={t('rp_sub')} />
            </Reveal>

            <Reveal index={2}>
              <GlassPanel>
                {!params.email && (
                  <View style={styles.field}>
                    <FieldLabel>{t('fp_email_label')}</FieldLabel>
                    <GlassInput
                      placeholder="ton@email.com"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                {/* Code OTP */}
                <View style={styles.field}>
                  <FieldLabel>{t('rp_code_label')}</FieldLabel>
                  <GlassInput
                    style={styles.codeInput}
                    placeholder="123456"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>

                {/* Nouveau mdp */}
                <View style={styles.field}>
                  <FieldLabel>{t('rp_new_password_label')}</FieldLabel>
                  <GlassPasswordInput
                    ref={passwordRef}
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="next"
                  />
                </View>

                {/* Confirmation */}
                <View style={styles.field}>
                  <FieldLabel>{t('rp_confirm_label')}</FieldLabel>
                  <GlassPasswordInput
                    style={confirm.length > 0 && !passwordMatch ? styles.inputError : undefined}
                    placeholder="••••••••"
                    value={confirm}
                    onChangeText={setConfirm}
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                  />
                  {confirm.length > 0 && !passwordMatch ? (
                    <Text style={styles.fieldError}>{t('rp_password_mismatch')}</Text>
                  ) : null}
                </View>

                {error ? <ErrorBanner message={error} /> : null}

                <BrandButton
                  label={t('rp_submit_btn')}
                  onPress={handleReset}
                  disabled={!canSubmit}
                  loading={loading}
                />

                <TextLink label={t('rp_resend_btn')} onPress={() => router.replace('/forgot-password')} />
              </GlassPanel>
            </Reveal>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_BLACK },
  flex: { flex: 1 },
  screen: { flexGrow: 1, paddingHorizontal: spacing.lg },
  content: { flex: 1, gap: spacing.lg, marginTop: spacing.xl },
  field: { gap: spacing.xs },
  codeInput: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
  },
  inputError: { borderColor: colors.danger },
  fieldError: { ...typography.caption, color: '#FF9DA0' },
  successBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  successBtn: { alignSelf: 'stretch' },
});
