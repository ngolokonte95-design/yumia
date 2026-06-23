/**
 * FORGOT PASSWORD — saisie de l'email pour recevoir un OTP de réinitialisation.
 */
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { forgotPasswordRequest } from '../lib/auth-api';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={styles.content}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Mot de passe oublié</Text>

          {!sent ? (
            <>
              <Text style={styles.sub}>
                Saisis ton email et nous t'envoyons un code à 6 chiffres valable 15 minutes.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ton@email.com"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={canSubmit ? handleSubmit : undefined}
                  returnKeyType="send"
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.btn, !canSubmit && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>Envoyer le code</Text>
                }
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sub}>
                Si un compte existe pour cet email, un code vient d'être envoyé.{'\n'}
                Vérifie ta boîte mail (et tes spams).
              </Text>

              <Pressable
                style={styles.btn}
                onPress={() => router.push('/reset-password')}
              >
                <Text style={styles.btnText}>Saisir le code →</Text>
              </Pressable>

              <Pressable style={styles.linkBtn} onPress={() => setSent(false)}>
                <Text style={styles.linkText}>Renvoyer un code</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  backBtn: { marginBottom: spacing.xl },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  content: { flex: 1, gap: spacing.lg },
  emoji: { fontSize: 48 },
  title: { ...typography.display, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  error: { ...typography.caption, color: colors.danger },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { ...typography.body, color: '#fff', fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.brandSoft },
});
