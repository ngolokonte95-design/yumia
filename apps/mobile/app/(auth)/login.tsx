import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { useGoogleAuth } from '../../lib/useGoogleAuth';
import { useAppleAuth } from '../../lib/useAppleAuth';
import { useI18n } from '../../lib/useI18n';

/** Connexion par email + mot de passe. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, applyAuthResult } = useAuth();
  const google = useGoogleAuth(applyAuthResult);
  const apple = useAppleAuth(applyAuthResult);
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 1 && !submitting;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      // La redirection vers (tabs) est gérée par le gate du layout racine.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{t('login_title')}</Text>
        <Text style={styles.subtitle}>{t('login_subtitle')}</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('email_placeholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder={t('password_placeholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {google.error ? <Text style={styles.error}>{google.error}</Text> : null}
          {apple.error ? <Text style={styles.error}>{apple.error}</Text> : null}

          <Pressable
            style={styles.forgotBtn}
            onPress={() => router.push('/forgot-password')}
          >
            <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
          </Pressable>

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            disabled={!canSubmit}
            onPress={onSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('login_btn')}</Text>
            )}
          </Pressable>

          {(google.available || apple.available) ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or')}</Text>
                <View style={styles.dividerLine} />
              </View>
              {google.available ? (
                <Pressable
                  style={[styles.socialBtn, google.loading && styles.buttonDisabled]}
                  disabled={google.loading}
                  onPress={google.signIn}
                >
                  {google.loading ? (
                    <ActivityIndicator color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.socialText}>🔵 {t('google_btn')}</Text>
                  )}
                </Pressable>
              ) : null}
              {apple.available ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.pill}
                  style={styles.appleBtn}
                  onPress={apple.signIn}
                />
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('no_account')} </Text>
          <Link href="/register" style={styles.footerLink}>
            {t('create_account')}
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  logo: { width: 140, height: 140, alignSelf: 'center', marginBottom: spacing.lg },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  form: { marginTop: spacing.xl, gap: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
  },
  error: { ...typography.caption, color: colors.danger },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.heading, color: '#fff' },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  forgotText: { ...typography.caption, color: colors.brandSoft },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { ...typography.body, color: colors.brandSoft, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.textMuted },
  socialBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  socialText: { ...typography.heading, color: colors.textPrimary },
  appleBtn: { width: '100%', height: 48 },
});
