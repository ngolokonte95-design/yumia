/**
 * Onboarding « Aha moment < 90 s ».
 * Trois étapes :
 *   1. Genre (obligatoire — cf. commentaire sur GENDERS plus bas)
 *   2. Sélection des univers favoris (multi-sélection, grille 2 colonnes)
 *   3. Restrictions alimentaires (tags courants)
 * → PATCH /auth/me → preferences.onboardingComplete = true → redirect /
 *
 * Mise en scène (17/11/2026) : fond spatial de l'Accueil, barre de
 * progression, étapes qui apparaissent en cascade, choix en verre qui
 * prennent le dégradé de marque une fois sélectionnés (une seule couleur).
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { useAuth } from '../../lib/auth-context';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { universeLabel } from '../../lib/universeMeta';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { PressableScale, Reveal } from '../../components/ui';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import {
  BrandButton, ErrorBanner, GlassBackButton, HeroTitle, SelectChip, SPACE_BLACK, SpaceBackdrop,
  StepProgress, TextLink,
} from '../../components/auth/AuthChrome';

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

// Le genre est demandé ICI (et non sur l'écran d'inscription) car les
// créations de compte via Google et Apple ne passent jamais par cet écran :
// l'onboarding est le seul point de passage commun à TOUS les nouveaux
// comptes. Sans cette donnée, le filtre homme/femme du mode social ne peut
// renvoyer aucun profil.
const GENDERS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'male', labelKey: 'esp_gender_male' },
  { value: 'female', labelKey: 'esp_gender_female' },
  { value: 'other', labelKey: 'esp_gender_other' },
];

type Step = 'gender' | 'universes' | 'restrictions';

export default function OnboardingScreen() {
  const { updateProfile, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>('gender');
  const [gender, setGender] = useState<string | null>(user?.gender ?? null);
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
        ...(gender ? { gender } : {}),
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
    <View style={styles.root}>
      <SpaceBackdrop />
      <SafeAreaView style={styles.safe}>
        <View style={styles.progress}>
          <StepProgress step={step === 'gender' ? 0 : step === 'universes' ? 1 : 2} total={3} />
        </View>
        {/* `key` = étape : chaque étape remonte et rejoue son entrée en cascade. */}
        {step === 'gender' ? (
          <GenderStep
            key="gender"
            firstName={firstName}
            selected={gender}
            onSelect={setGender}
            onNext={() => setStep('universes')}
            t={t}
          />
        ) : step === 'universes' ? (
          <UniverseStep
            key="universes"
            firstName={firstName}
            selected={selectedUniverses}
            onToggle={toggleUniverse}
            onBack={() => setStep('gender')}
            onNext={() => setStep('restrictions')}
            t={t}
          />
        ) : (
          <RestrictionsStep
            key="restrictions"
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
    </View>
  );
}

type TFn = ReturnType<typeof useI18n>['t'];

// ─── Step 1 : genre ───────────────────────────────────────────────────────────

function GenderStep({
  firstName,
  selected,
  onSelect,
  onNext,
  t,
}: {
  firstName: string;
  selected: string | null;
  onSelect: (g: string) => void;
  onNext: () => void;
  t: TFn;
}) {
  const greeting = firstName
    ? `${t('onboarding_welcome')}, ${firstName} !`
    : `${t('onboarding_welcome')} !`;

  return (
    <View style={styles.container}>
      <Reveal index={0} style={styles.header}>
        <HeroTitle title={greeting} subtitle={t('onboarding_gender_title')} />
      </Reveal>

      <Reveal index={1} style={styles.tagWrap}>
        {GENDERS.map((g) => (
          <SelectChip
            key={g.value}
            label={t(g.labelKey)}
            active={selected === g.value}
            onPress={() => onSelect(g.value)}
          />
        ))}
      </Reveal>

      <Reveal index={2}>
        <Text style={styles.genderHint}>{t('onboarding_gender_sub')}</Text>
      </Reveal>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <BrandButton label={t('continue_btn')} onPress={onNext} disabled={!selected} />
      </View>
    </View>
  );
}

// ─── Step 2 : universes ───────────────────────────────────────────────────────

function UniverseStep({
  firstName,
  selected,
  onToggle,
  onBack,
  onNext,
  t,
}: {
  firstName: string;
  selected: Universe[];
  onToggle: (k: Universe) => void;
  onBack: () => void;
  onNext: () => void;
  t: TFn;
}) {
  const greeting = firstName
    ? `${t('onboarding_welcome')}, ${firstName} !`
    : `${t('onboarding_welcome')} !`;

  return (
    <View style={styles.container}>
      <Reveal index={0} style={styles.header}>
        <View style={styles.backRow}>
          <GlassBackButton onPress={onBack} />
          {selected.length > 0 ? (
            <View style={styles.countPill}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.countPillFill]} />
              <Text style={styles.countPillText}>{selected.length}</Text>
            </View>
          ) : null}
        </View>
        <HeroTitle title={greeting} subtitle={t('onboarding_universes_sub')} />
      </Reveal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {UNIVERSE_CATEGORIES.map((cat, ci) => (
          <Reveal key={cat.key} index={Math.min(ci + 1, 5)}>
            <View style={styles.catHead}>
              <Text style={styles.catLabel} numberOfLines={1}>{cat.emoji}  {t(`category_${cat.key}` as never)}</Text>
              <View style={styles.catRule} />
            </View>
            <View style={styles.grid}>
              {cat.universes.map((key) => {
                const active = selected.includes(key);
                return (
                  <PressableScale
                    key={key}
                    style={[styles.universeCard, active && styles.universeCardActive]}
                    onPress={() => onToggle(key)}
                    scaleTo={0.95}
                    haptic
                  >
                    {active ? (
                      <LinearGradient
                        colors={gradients.brand}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.cardFill]}
                      />
                    ) : null}
                    <View style={[styles.universeIcon, active && styles.universeIconActive]}>
                      <UniverseGlyph u={key} size={26} />
                    </View>
                    <Text style={[styles.universeLabel, active && styles.universeLabelActive]} numberOfLines={2}>
                      {universeLabel(t, key)}
                    </Text>
                    {active ? (
                      <View style={styles.check}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
          </Reveal>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <BrandButton label={t('continue_btn')} onPress={onNext} disabled={selected.length === 0} />
        <TextLink label={t('onboarding_skip')} onPress={onNext} />
      </View>
    </View>
  );
}

// ─── Step 3 : restrictions ────────────────────────────────────────────────────

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
      <Reveal index={0} style={styles.header}>
        <View style={styles.backRow}>
          <GlassBackButton onPress={onBack} />
        </View>
        <HeroTitle title={t('onboarding_restrictions_title')} subtitle={t('onboarding_restrictions_sub')} />
      </Reveal>

      <Reveal index={1} style={styles.tagWrap}>
        {RESTRICTION_TAGS.map((tag) => (
          <SelectChip
            key={tag}
            label={tag}
            active={selected.includes(tag)}
            onPress={() => onToggle(tag)}
          />
        ))}
      </Reveal>

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorBanner message={error} />
        </View>
      ) : null}

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <BrandButton label={t('onboarding_finish')} onPress={onFinish} disabled={loading} loading={loading} />
        {!loading && (
          <TextLink label={t('onboarding_no_restriction')} onPress={onFinish} />
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_BLACK },
  safe: { flex: 1 },
  progress: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { flex: 1 },

  countPill: {
    minWidth: 36, height: 30, paddingHorizontal: 10, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  countPillFill: { borderRadius: radius.pill },
  countPillText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  scrollContent: { paddingBottom: spacing.xl },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  catLabel: {
    color: colors.textPrimary, fontSize: 12, fontWeight: '800',
    letterSpacing: 1.6, textTransform: 'uppercase', flexShrink: 1,
  },
  catRule: { flex: 1, minWidth: 16, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.xs },
  universeCard: {
    width: '48.5%',
    backgroundColor: 'rgba(20,20,28,0.78)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  universeCardActive: { borderColor: 'rgba(255,255,255,0.35)' },
  cardFill: { borderRadius: radius.lg },
  universeIcon: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  universeIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  universeLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  universeLabelActive: { color: '#fff', fontWeight: '800' },
  check: {
    position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  checkText: { color: colors.brand, fontSize: 13, fontWeight: '900' },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  genderHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md, lineHeight: 18 },

  footer: { paddingVertical: spacing.lg, gap: spacing.sm },
  errorWrap: { marginTop: spacing.md },
});
