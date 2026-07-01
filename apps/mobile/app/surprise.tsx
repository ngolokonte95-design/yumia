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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeMeta } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
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
  const { accessToken, user } = useAuth();
  const { coords, city } = useLocation();

  const [result, setResult] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spins, setSpins] = useState(0);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage } = usePlanLimits();

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
        restrictions: user?.preferences?.restrictions,
      });

      if (!data.suggestions.length) {
        setError('Aucune surprise près de toi pour l\'instant. Réessaie !');
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
  }, [loading, coords, city, user, shake, fadeAnim, checkLimit, recordUsage]);

  function goToDetail() {
    if (!result) return;
    placeStore.set(result);
    router.push('/place');
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
              {meta.labelFr} · ⭐ {result.place.rating.toFixed(1)} · {'€'.repeat(result.place.priceTier)}
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
