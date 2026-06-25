/**
 * Onboarding « Aha moment < 90 s ».
 * Deux étapes :
 *   1. Sélection des univers favoris (multi-sélection, grille 2 colonnes)
 *   2. Restrictions alimentaires (tags courants)
 * → PATCH /auth/me → preferences.onboardingComplete = true → redirect /
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { useAuth } from '../../lib/auth-context';
import { useI18n } from '../../lib/useI18n';
import { colors, radius, spacing, typography } from '../../theme/tokens';

// Restriction tags stay in French — they're used as keys by the AI engine.
const RESTRICTION_TAGS = [
  'Végétarien',
  'Vegan',
  'Halal',
  'Casher',
  'Sans gluten',
  'Sans lactose',
  'Sans alcool',
  'Sans noix',
];

type Step = 'universes' | 'restrictions';

export default function OnboardingScreen() {
  const { updateProfile, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>('universes');
  const [selectedUniverses, setSelectedUniverses] = useState<Universe[]>([]);
  const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleUniverse(key: Universe) {
    setSelectedUniverses((prev) =>
      prev.includes(key) ? prev.filter((u) => u !== key) : [...prev, key],
    );
  }

  function toggleRestriction(tag: string) {
    setSelectedRestrictions((prev) =>
      prev.includes(tag) ? prev.filter((r) => r !== tag) : [...prev, tag],
    );
  }

  async function finish() {
    setLoading(true);
    setError(null);
    try {
      await updateProfile({
        preferences: {
          favoriteUniverses: selectedUniverses,
          restrictions: selectedRestrictions,
          onboardingComplete: true,
        },
      });
      // Navigation explicite et déterministe vers l'app principale.
      // (En complément de l'AuthGate, pour ne pas dépendre du timing de l'effet.)
      router.replace('/(tabs)');
    } catch {
      setError(t('error_generic'));
      setLoading(false);
    }
  }

  const firstName = user?.displayName?.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={styles.safe}>
      {step === 'universes' ? (
        <UniverseStep
          firstName={firstName}
          selected={selectedUniverses}
          onToggle={toggleUniverse}
          onNext={() => setStep('restrictions')}
          t={t}
        />
      ) : (
        <RestrictionsStep
          selected={selectedRestrictions}
          onToggle={toggleRestriction}
          onBack={() => setStep('universes')}
          onFinish={finish}
          loading={loading}
          error={error}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Step 1 : universes ───────────────────────────────────────────────────────

type TFn = ReturnType<typeof useI18n>['t'];

function UniverseStep({
  firstName,
  selected,
  onToggle,
  onNext,
  t,
}: {
  firstName: string;
  selected: Universe[];
  onToggle: (k: Universe) => void;
  onNext: () => void;
  t: TFn;
}) {
  const greeting = firstName
    ? `${t('onboarding_welcome')}, ${firstName} !`
    : `${t('onboarding_welcome')} !`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{greeting}</Text>
        <Text style={styles.subtitle}>{t('onboarding_universes_sub')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {UNIVERSES.map((key) => {
          const meta = UNIVERSE_META[key];
          const active = selected.includes(key);
          return (
            <Pressable
              key={key}
              style={[styles.universeCard, active && styles.universeCardActive]}
              onPress={() => onToggle(key)}
            >
              <Text style={styles.universeEmoji}>{meta.emoji}</Text>
              <Text style={[styles.universeLabel, active && styles.universeLabelActive]}>
                {meta.labelFr}
              </Text>
              {active && <View style={styles.checkDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.btn, selected.length === 0 && styles.btnDisabled]}
          onPress={onNext}
          disabled={selected.length === 0}
        >
          <Text style={styles.btnText}>{t('continue_btn')}</Text>
        </Pressable>
        <Pressable onPress={onNext} style={styles.skipBtn}>
          <Text style={styles.skipText}>{t('onboarding_skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Step 2 : restrictions ────────────────────────────────────────────────────

function RestrictionsStep({
  selected,
  onToggle,
  onBack,
  onFinish,
  loading,
  error,
  t,
}: {
  selected: string[];
  onToggle: (tag: string) => void;
  onBack: () => void;
  onFinish: () => void;
  loading: boolean;
  error: string | null;
  t: TFn;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{t('back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('onboarding_restrictions_title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding_restrictions_sub')}</Text>
      </View>

      <View style={styles.tagWrap}>
        {RESTRICTION_TAGS.map((tag) => {
          const active = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.tag, active && styles.tagActive]}
              onPress={() => onToggle(tag)}
            >
              <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.footer}>
        <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={onFinish} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.btnText}>{t('onboarding_finish')}</Text>
          )}
        </Pressable>
        {!loading && (
          <Pressable onPress={onFinish} style={styles.skipBtn}>
            <Text style={styles.skipText}>{t('onboarding_no_restriction')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.xl, paddingBottom: spacing.lg },
  title: { ...typography.display, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.xl },
  universeCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    position: 'relative',
  },
  universeCardActive: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}18`,
  },
  universeEmoji: { fontSize: 30 },
  universeLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  universeLabelActive: { color: colors.brandSoft },
  checkDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tag: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}18` },
  tagText: { ...typography.body, color: colors.textSecondary },
  tagTextActive: { color: colors.brandSoft },

  footer: { paddingVertical: spacing.xl, gap: spacing.sm },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { ...typography.body, color: '#fff', fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { ...typography.caption, color: colors.textMuted },

  backBtn: { marginBottom: spacing.md },
  backText: { ...typography.body, color: colors.brandSoft },

  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
});
