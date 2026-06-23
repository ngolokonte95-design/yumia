/**
 * RESET PASSWORD — saisie du code OTP + nouveau mot de passe.
 */
import { useState, useRef } from 'react';
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
import { resetPasswordRequest } from '../lib/auth-api';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordMatch = password === confirm;
  const canSubmit =
    code.trim().length === 6 &&
    password.length >= 8 &&
    passwordMatch &&
    !loading;

  async function handleReset() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await resetPasswordRequest(code.trim(), password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.successBox}>
          <Text style={styles.successEmoji}>✅</Text>
          <Text style={styles.successTitle}>Mot de passe mis à jour !</Text>
          <Text style={styles.successSub}>
            Tu peux maintenant te connecter avec ton nouveau mot de passe.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.btnText}>Se connecter</Text>
          </Pressable>
        </View>
      </View>
    );
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
          <Text style={styles.emoji}>🔐</Text>
          <Text style={styles.title}>Nouveau mot de passe</Text>
          <Text style={styles.sub}>Saisis le code reçu par email et ton nouveau mot de passe.</Text>

          {/* Code OTP */}
          <View style={styles.field}>
            <Text style={styles.label}>Code à 6 chiffres</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="123456"
              placeholderTextColor={colors.textMuted}
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
            <Text style={styles.label}>Nouveau mot de passe (8 car. min.)</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
            />
          </View>

          {/* Confirmation */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <TextInput
              style={[styles.input, confirm.length > 0 && !passwordMatch && styles.inputError]}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleReset}
            />
            {confirm.length > 0 && !passwordMatch ? (
              <Text style={styles.fieldError}>Les mots de passe ne correspondent pas.</Text>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, !canSubmit && styles.btnDisabled]}
            onPress={handleReset}
            disabled={!canSubmit}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Réinitialiser</Text>
            }
          </Pressable>

          <Pressable style={styles.linkBtn} onPress={() => router.replace('/forgot-password')}>
            <Text style={styles.linkText}>Renvoyer un code</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  backBtn: { marginBottom: spacing.xl },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  content: { flex: 1, gap: spacing.md },
  emoji: { fontSize: 48 },
  title: { ...typography.display, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.sm },
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
  codeInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  inputError: { borderColor: colors.danger },
  fieldError: { ...typography.caption, color: colors.danger },
  error: { ...typography.caption, color: colors.danger },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { ...typography.body, color: '#fff', fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: colors.brandSoft },
  successBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  successEmoji: { fontSize: 64 },
  successTitle: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  successSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
