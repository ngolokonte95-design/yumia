/**
 * SURPRISE ME — tirage aléatoire d'un lieu : l'IA choisit pour toi.
 * Chaque tap relance la roulette et incrémente vers le badge "Aventurier".
 * Accessible depuis le bouton 🎲 sur l'écran d'accueil.
 */
import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSE_CATEGORIES, UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { safeMeta, universeLabel } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchTop3 } from '../lib/api';
import { placeStore } from '../lib/place-store';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import type { Suggestion } from '@yumia/shared';

export default function SurpriseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const { accessToken, user } = useAuth();
  const { coords, city } = useLocation();

  const [result, setResult] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spins, setSpins] = useState(0);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage } = usePlanLimits();

  // `null` = tous les univers (comportement d'origine).
  const [universeFilter, setUniverseFilter] = useState<Universe | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Shake animation for the dice
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Fade-in for the result card
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const spin = useCallback(async () => {
    if (loading) return;
    const { allowed, message } = await checkLimit('predictivePerWeek');
    if (!allowed) { setUpsell(message); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    fadeAnim.setValue(0);
    shake();

    try {
      const data = await fetchTop3({
        lat: coords.lat,
        lng: coords.lng,
        locale: user?.locale ?? 'fr',
        localTimeIso: new Date().toISOString(),
        city: city ?? undefined,
        favoriteUniverses: user?.preferences?.favoriteUniverses,
        universeFilter: universeFilter ?? undefined,
        restrictions: user?.preferences?.restrictions,
      });

      if (!data.suggestions.length) {
        setError(
          universeFilter
            ? `Aucun lieu de ce type près de toi pour l'instant. Essaie un autre univers, ou réessaie !`
            : 'Aucune surprise près de toi pour l\'instant. Réessaie !',
        );
        return;
      }

      // Pick one at random from the Top 3
      const pick = data.suggestions[Math.floor(Math.random() * data.suggestions.length)];
      setResult(pick);
      setSpins((n) => n + 1);
      await recordUsage('predictivePerWeek');

      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur. Réessaie !');
    } finally {
      setLoading(false);
    }
  }, [loading, coords, city, user, universeFilter, shake, fadeAnim, checkLimit, recordUsage]);

  function goToDetail() {
    if (!result) return;
    placeStore.set(result);
    router.push('/place');
  }

  /** Change l'univers ciblé : le résultat affiché devient obsolète, on l'efface. */
  function selectUniverse(u: Universe | null) {
    setUniverseFilter(u);
    setPickerOpen(false);
    setResult(null);
    setError(null);
  }

  const meta = result ? safeMeta(result.place.universe) : null;

  const translateX = shakeAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-12, 12],
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Retour</Text>
      </Pressable>

      <View style={styles.body}>
        <Text style={styles.heading}>🎲 Surprise Me</Text>
        <Text style={styles.sub}>
          L'IA choisit pour toi. Un tap, un endroit. Pas le temps de chercher.
        </Text>

        {/* Univers dans lequel le dé est lancé — "Tous" par défaut (comportement
            d'origine). Le changer relance une nouvelle surprise à vide plutôt
            que de laisser un résultat de l'ancien univers affiché. */}
        <Pressable style={styles.universePicker} onPress={() => setPickerOpen(true)}>
          <Text style={styles.universePickerText}>
            {universeFilter ? `${UNIVERSE_META[universeFilter].emoji} ${universeLabel(t, universeFilter)}` : '🎲 Tous les univers'}
          </Text>
          <Text style={styles.universePickerChevron}>▾</Text>
        </Pressable>

        {/* Main dice button */}
        <Animated.View style={{ transform: [{ translateX }] }}>
          <Pressable
            style={[styles.diceBtn, loading && styles.diceBtnLoading]}
            onPress={spin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={styles.diceEmoji}>🎲</Text>
            )}
          </Pressable>
        </Animated.View>

        <Text style={styles.tapHint}>
          {spins === 0 ? 'Appuie pour découvrir' : 'Encore ?'}
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Result card */}
        {result && meta ? (
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            <Text style={styles.cardEmoji}>{meta.emoji}</Text>
            <Text style={styles.cardName}>{result.place.name}</Text>
            <Text style={styles.cardMeta}>
              {universeLabel(t, result.place.universe)} · ⭐ {result.place.rating.toFixed(1)} · {'€'.repeat(result.place.priceTier)}
              {result.place.city ? ` · ${result.place.city}` : ''}
            </Text>
            <Text style={styles.cardReason}>🤖 {result.reason}</Text>

            <View style={styles.cardActions}>
              <Pressable style={styles.cardBtn} onPress={goToDetail}>
                <Text style={styles.cardBtnText}>Voir le lieu</Text>
              </Pressable>
              <Pressable style={[styles.cardBtn, styles.cardBtnSecondary]} onPress={spin}>
                <Text style={styles.cardBtnSecondaryText}>🎲 Autre chose</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {spins > 0 ? (
          <Text style={styles.countHint}>
            {spins} {spins === 1 ? 'tirage' : 'tirages'}
            {spins >= 10 ? ' 🎉' : ''}
          </Text>
        ) : null}
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Univers du dé</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.universeRow, universeFilter === null && styles.universeRowActive]}
                onPress={() => selectUniverse(null)}
              >
                <Text style={styles.universeRowEmoji}>🎲</Text>
                <Text style={styles.universeRowLabel}>Tous les univers</Text>
                {universeFilter === null && <Text style={styles.universeRowCheck}>✓</Text>}
              </Pressable>

              {UNIVERSE_CATEGORIES.map((cat) => (
                <View key={cat.label} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>{cat.emoji} {cat.label}</Text>
                  {cat.universes.map((u) => (
                    <Pressable
                      key={u}
                      style={[styles.universeRow, universeFilter === u && styles.universeRowActive]}
                      onPress={() => selectUniverse(u)}
                    >
                      <Text style={styles.universeRowEmoji}>{UNIVERSE_META[u].emoji}</Text>
                      <Text style={styles.universeRowLabel}>{universeLabel(t, u)}</Text>
                      {universeFilter === u && <Text style={styles.universeRowCheck}>✓</Text>}
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backBtn: { padding: spacing.md },
  backText: { ...typography.body, color: colors.brandSoft },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  heading: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  diceBtn: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  diceBtnLoading: { opacity: 0.7 },
  diceEmoji: { fontSize: 56 },
  tapHint: { ...typography.caption, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },

  universePicker: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  universePickerText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  universePickerChevron: { color: colors.textMuted, fontSize: 12 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.heading, color: colors.textPrimary,
    textAlign: 'center', paddingBottom: spacing.sm,
  },
  categoryBlock: { marginTop: spacing.md },
  categoryLabel: {
    ...typography.label, color: colors.textMuted, textTransform: 'uppercase',
    paddingBottom: spacing.xs,
  },
  universeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 11, paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  universeRowActive: { backgroundColor: `${colors.brand}18` },
  universeRowEmoji: { fontSize: 18, width: 26 },
  universeRowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  universeRowCheck: { ...typography.body, color: colors.brand, fontWeight: '700' },

  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  cardEmoji: { fontSize: 52 },
  cardName: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  cardMeta: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  cardReason: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingTop: spacing.xs,
  },
  cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, width: '100%' },
  cardBtn: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cardBtnText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  cardBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBtnSecondaryText: { ...typography.caption, color: colors.textSecondary },

  countHint: { ...typography.caption, color: colors.textMuted },
});
