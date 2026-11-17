import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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
import { AgeGateModal } from '../../components/AgeGateModal';
import { Reveal } from '../../components/ui';
import {
  AuthLogo, BrandButton, ErrorBanner, GlassInput, GlassPanel, GlassPasswordInput, GoogleButton,
  HeroTitle, OrDivider, SPACE_BLACK, SpaceBackdrop, TextLink,
} from '../../components/auth/AuthChrome';

/**
 * Connexion par email + mot de passe.
 * Mise en scène (17/11/2026) : fond spatial de l'Accueil, logo sur halo,
 * formulaire en panneau de verre, une seule couleur d'accent (marque).
 */
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
      setError(err instanceof Error ? err.message : t('login_error_generic'));
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <SpaceBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ScrollView : même raison que sur l'écran d'inscription — avec les
            boutons Google + Apple, le bas de l'écran devenait inaccessible. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthLogo size={124} />

          <Reveal index={1}>
            <HeroTitle title={t('login_title')} subtitle={t('login_subtitle')} center />
          </Reveal>

          <Reveal index={2}>
            <GlassPanel style={styles.form}>
              <GlassInput
                placeholder={t('email_placeholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <GlassPasswordInput
                placeholder={t('password_placeholder')}
                value={password}
                onChangeText={setPassword}
              />

              {error ? <ErrorBanner message={error} /> : null}
              {google.error ? <ErrorBanner message={google.error} /> : null}
              {apple.error ? <ErrorBanner message={apple.error} /> : null}

              <TextLink
                label={t('login_forgot_password')}
                onPress={() => router.push('/forgot-password')}
                style={styles.forgot}
              />

              <BrandButton
                label={t('login_btn')}
                onPress={onSubmit}
                disabled={!canSubmit}
                loading={submitting}
              />

              {(google.available || apple.available) ? (
                <>
                  <OrDivider label={t('or')} />
                  {google.available ? (
                    <GoogleButton
                      label={`🔵 ${t('google_btn')}`}
                      onPress={() => google.signIn()}
                      disabled={google.loading}
                      loading={google.loading}
                    />
                  ) : null}
                  {apple.available ? (
                    // Bouton officiel Apple, version blanche : c'est celle que
                    // les consignes Apple demandent sur un fond sombre.
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                      cornerRadius={radius.pill}
                      style={styles.appleBtn}
                      onPress={() => apple.signIn()}
                    />
                  ) : null}
                </>
              ) : null}
            </GlassPanel>
          </Reveal>

          {/* Google et Apple créent aussi des comptes : quelqu'un qui arrive ici
              sans compte s'inscrit sans passer par l'écran d'inscription. Le
              serveur réclame alors la date de naissance, et seulement là. */}
          <AgeGateModal
            visible={google.needsAge || apple.needsAge}
            onCancel={google.needsAge ? google.cancelAge : apple.cancelAge}
            onSubmit={google.needsAge ? google.submitBirthDate : apple.submitBirthDate}
          />

          <Reveal index={3} style={styles.footer}>
            <Text style={styles.footerText}>{t('no_account')} </Text>
            <Link href="/register" style={styles.footerLink}>
              {t('create_account')}
            </Link>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE_BLACK },
  flex: { flex: 1 },
  // flexGrow (pas flex) : contentContainerStyle de ScrollView.
  container: { flexGrow: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },
  form: { marginTop: spacing.xs },
  forgot: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  appleBtn: { width: '100%', height: 50 },
});
