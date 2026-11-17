/**
 * FORGOT PASSWORD — saisie de l'email pour recevoir un OTP de réinitialisation.
 * Mise en scène (17/11/2026) : fond spatial, médaillon de marque, panneau de
 * verre, une seule couleur d'accent.
 */
import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import { forgotPasswordRequest } from '../lib/auth-api';
import { useI18n } from '../lib/useI18n';
import { Reveal } from '../components/ui';
import {
  BrandButton, BrandMedal, ErrorBanner, FieldLabel, GlassBackButton, GlassInput, GlassPanel,
  HeroTitle, SPACE_BLACK, SpaceBackdrop, TextLink,
} from '../components/auth/AuthChrome';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && !loading;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await forgotPasswordRequest(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fp_error_generic'));
    } finally {
      setLoading(false);
    }
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
            <BrandMedal emoji="🔑" />
            <Reveal index={1}>
              <HeroTitle
                title={t('fp_title')}
                subtitle={!sent ? t('fp_sub_request') : t('fp_sub_sent')}
              />
            </Reveal>

            <Reveal index={2}>
              <GlassPanel>
                {!sent ? (
                  <>
                    <View style={styles.field}>
                      <FieldLabel>{t('fp_email_label')}</FieldLabel>
                      <GlassInput
                        placeholder="ton@email.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={canSubmit ? handleSubmit : undefined}
                        returnKeyType="send"
                      />
                    </View>

                    {error ? <ErrorBanner message={error} /> : null}

                    <BrandButton
                      label={t('fp_send_code_btn')}
                      onPress={handleSubmit}
                      disabled={!canSubmit}
                      loading={loading}
                    />
                  </>
                ) : (
                  <>
                    <View style={styles.sentRow}>
                      <Text style={styles.sentIcon}>✉️</Text>
                      <Text style={styles.sentEmail} numberOfLines={1}>{email.trim().toLowerCase()}</Text>
                    </View>

                    <BrandButton
                      label={t('fp_enter_code_btn')}
                      onPress={() => router.push({ pathname: '/reset-password', params: { email: email.trim().toLowerCase() } })}
                    />

                    <TextLink label={t('fp_resend_btn')} onPress={() => setSent(false)} />
                  </>
                )}
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
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sentIcon: { fontSize: 18 },
  sentEmail: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flexShrink: 1 },
});
