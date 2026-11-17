import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useAuth } from '../../lib/auth-context';
import { useGoogleAuth } from '../../lib/useGoogleAuth';
import { useAppleAuth } from '../../lib/useAppleAuth';
import { useI18n } from '../../lib/useI18n';
import { PRIVACY_URL, TERMS_URL } from '../../lib/legal';
import { AgeGateFields, AgeGateModal } from '../../components/AgeGateModal';
import { MIN_SIGNUP_AGE, ageFromIso, toIsoBirthDate } from '../../lib/age-gate';
import { Reveal } from '../../components/ui';
import {
  AuthLogo, BrandButton, ErrorBanner, FieldLabel, GlassInput, GlassPanel, GlassPasswordInput,
  GoogleButton, HeroTitle, OrDivider, SPACE_BLACK, SpaceBackdrop,
} from '../../components/auth/AuthChrome';

/**
 * Création de compte par email + mot de passe.
 * Mise en scène (17/11/2026) : fond spatial de l'Accueil, logo sur halo,
 * formulaire en panneau de verre, une seule couleur d'accent (marque).
 */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register, applyAuthResult } = useAuth();
  const google = useGoogleAuth(applyAuthResult);
  const apple = useAppleAuth(applyAuthResult);
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La date de naissance est demandée ici, avant toute création de compte —
  // voir lib/age-gate.ts. Tant qu'elle est incomplète, `birthDate` vaut null
  // et le bouton reste inactif : rien n'indique à l'écran quelle date passe.
  const birthDate = toIsoBirthDate(Number(day), Number(month), Number(year));
  const age = ageFromIso(birthDate);
  const dateComplete = day.length > 0 && month.length > 0 && year.length === 4;
  const tooYoung = age !== null && age < MIN_SIGNUP_AGE;

  const canSubmit =
    displayName.trim().length >= 2 &&
    email.trim().length > 3 &&
    password.length >= 8 &&
    birthDate !== null &&
    !tooYoung &&
    !submitting;

  async function onSubmit() {
    if (!birthDate) return;
    setSubmitting(true);
    setError(null);
    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        birthDate,
      });
      // Redirection vers (tabs) gérée par le gate du layout racine.
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register_error_generic'));
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
        {/* ScrollView (et non une View fixe) : avec les boutons Google + Apple
            affichés, le contenu dépasse la hauteur de l'écran sur beaucoup de
            téléphones — le texte légal et le lien « Se connecter » sortaient de
            l'écran sans aucun moyen d'y accéder. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthLogo size={104} />

          <Reveal index={1}>
            <HeroTitle title={t('register_title')} subtitle={t('register_subtitle')} center />
          </Reveal>

          <Reveal index={2}>
            <GlassPanel>
              <GlassInput
                placeholder={t('name_placeholder')}
                autoCapitalize="words"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <GlassInput
                placeholder={t('email_placeholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <GlassPasswordInput
                placeholder={t('password_hint')}
                value={password}
                onChangeText={setPassword}
              />

              <View style={styles.ageBlock}>
                <FieldLabel>{t('age_gate_title')}</FieldLabel>
                <AgeGateFields
                  day={day}
                  month={month}
                  year={year}
                  onDay={setDay}
                  onMonth={setMonth}
                  onYear={setYear}
                />
                {dateComplete && !birthDate ? (
                  <ErrorBanner message={t('age_gate_invalid')} />
                ) : tooYoung ? (
                  <ErrorBanner message={t('age_gate_denied_body').replace('{n}', String(MIN_SIGNUP_AGE))} />
                ) : (
                  <Text style={styles.fieldHint}>{t('age_gate_subtitle')}</Text>
                )}
              </View>

              {error ? <ErrorBanner message={error} /> : null}
              {google.error ? <ErrorBanner message={google.error} /> : null}
              {apple.error ? <ErrorBanner message={apple.error} /> : null}

              <BrandButton
                label={t('register_btn')}
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
                      onPress={() => google.signIn(birthDate ?? undefined)}
                      disabled={google.loading}
                      loading={google.loading}
                    />
                  ) : null}
                  {apple.available ? (
                    // Bouton officiel Apple, version blanche : c'est celle que
                    // les consignes Apple demandent sur un fond sombre.
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                      cornerRadius={radius.pill}
                      style={styles.appleBtn}
                      onPress={() => apple.signIn(birthDate ?? undefined)}
                    />
                  ) : null}
                </>
              ) : null}
            </GlassPanel>
          </Reveal>

          {/* Acceptation des conditions — exigée par Apple (règle 1.2, contenus
              publiés par les utilisateurs) et Google Play. Placée sous TOUS les
              boutons de création de compte, y compris Google et Apple, car tous
              créent un compte. Les deux liens doivent rester joignables : les
              testeurs des stores les ouvrent pendant la revue. */}
          <Text style={styles.legal}>
            {t('register_legal_prefix')}{' '}
            <Text style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}>
              {t('register_legal_terms')}
            </Text>
            {' '}{t('register_legal_and')}{' '}
            <Text style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              {t('register_legal_privacy')}
            </Text>
            {' '}{t('register_legal_suffix')}
          </Text>

          <AgeGateModal
            visible={google.needsAge || apple.needsAge}
            onCancel={google.needsAge ? google.cancelAge : apple.cancelAge}
            onSubmit={google.needsAge ? google.submitBirthDate : apple.submitBirthDate}
          />

          <Reveal index={3} style={styles.footer}>
            <Text style={styles.footerText}>{t('already_account')} </Text>
            <Link href="/login" style={styles.footerLink}>
              {t('sign_in')}
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
  // flexGrow (pas flex) : c'est un contentContainerStyle de ScrollView — le
  // contenu remplit l'écran quand il est court, et peut le dépasser sinon.
  container: { flexGrow: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },
  ageBlock: { gap: spacing.sm, marginTop: spacing.xs },
  fieldHint: { ...typography.caption, color: colors.textMuted, lineHeight: 16 },
  legal: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: { color: colors.brandSoft, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { ...typography.body, color: colors.textSecondary },
  footerLink: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  appleBtn: { width: '100%', height: 50 },
});
