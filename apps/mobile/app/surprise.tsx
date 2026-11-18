/**
 * SURPRISE ME — tirage aléatoire d'un lieu : l'IA choisit pour toi.
 * Chaque tap relance la roulette et incrémente vers le badge "Aventurier".
 * Accessible depuis le bouton 🎲 sur l'écran d'accueil.
 *
 * Mise en scène (18/11/2026) : fond « espace profond » de l'Accueil, dé
 * lumineux au dégradé de marque (halo au repos, rotation pendant le tirage),
 * puis révélation : la carte du lieu se retourne dans une gerbe de
 * particules, avec une vibration de succès. Une seule couleur d'accent.
 */
import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSE_CATEGORIES, UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { safeMeta, universeLabel } from '../lib/universeMeta';
import { colors, gradients, radius, spacing } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchTop3 } from '../lib/api';
import { placeStore } from '../lib/place-store';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import type { Suggestion } from '@yumia/shared';
import { ratingSuffix } from '../lib/place-rating';
import { GradientText, PressableScale } from '../components/ui';
import { BrandButton, GlassIconButton, OutlineButton } from '../components/social/SocialChrome';
import { BrandDot } from '../components/profile/ProfileChrome';
import { UniverseGlyph } from '../components/UniverseGlyph';
import { BACK_ARROW, BrandPill, GLASS_SURFACE, splitLeadingEmoji } from '../components/p2c/P2Visuals';
import { DiceButton, FlipReveal, ParticleBurst, SurpriseBackdrop } from '../components/p2c/SurpriseFx';

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
  const { checkLimit, recordUsage, quotaMessage } = usePlanLimits();

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
    const { allowed } = await checkLimit('surprisePerDay');
    if (!allowed) { setUpsell(quotaMessage('surprisePerDay', t('home_shortcut_surprise'))); return; }
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
            ? t('sur_no_results_filtered')
            : t('sur_no_results'),
        );
        return;
      }

      // Pick one at random from the Top 3
      const pick = data.suggestions[Math.floor(Math.random() * data.suggestions.length)];
      setResult(pick);
      setSpins((n) => n + 1);
      await recordUsage('surprisePerDay');

      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sur_generic_error'));
    } finally {
      setLoading(false);
    }
  }, [loading, coords, city, user, universeFilter, shake, fadeAnim, checkLimit, recordUsage, quotaMessage, t]);

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
      <SurpriseBackdrop />
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      <View style={styles.topBar}>
        <GlassIconButton icon={BACK_ARROW} onPress={() => router.back()} label={t('sur_back')} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <GradientText style={styles.heading}>{splitLeadingEmoji(t('sur_heading')).text}</GradientText>
        <Text style={styles.sub}>
          {t('sur_sub')}
        </Text>

        {/* Univers dans lequel le dé est lancé — "Tous" par défaut (comportement
            d'origine). Le changer relance une nouvelle surprise à vide plutôt
            que de laisser un résultat de l'ancien univers affiché. */}
        <PressableScale style={styles.universePicker} onPress={() => setPickerOpen(true)} scaleTo={0.96}>
          <Text style={styles.universePickerText}>
            {universeFilter ? `${UNIVERSE_META[universeFilter].emoji} ${universeLabel(t, universeFilter)}` : t('sur_all_universes')}
          </Text>
          <Text style={styles.universePickerChevron}>▾</Text>
        </PressableScale>

        {/* Le dé — secoué par l'animation d'origine pendant le tirage. */}
        <Animated.View style={{ transform: [{ translateX }] }}>
          <DiceButton loading={loading} onPress={spin} />
        </Animated.View>

        <Text style={styles.tapHint}>
          {spins === 0 ? t('sur_tap_discover') : t('sur_tap_again')}
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Révélation : la carte se retourne dans une gerbe de particules. */}
        {result && meta ? (
          <Animated.View style={[styles.reveal, { opacity: fadeAnim }]}>
            <ParticleBurst key={`burst-${spins}`} />
            <FlipReveal key={`card-${spins}`}>
              <View style={styles.card}>
                <View style={styles.cardPhoto}>
                  {result.place.photoUrls?.[0] ? (
                    <Image
                      source={{ uri: result.place.photoUrls[0] }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                  ) : (
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.cardPhotoEmpty]}>
                      <UniverseGlyph u={result.place.universe} size={64} />
                    </LinearGradient>
                  )}
                  {/* Voile confiné à la photo : lisibilité du nom posé dessus. */}
                  <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
                    locations={[0.35, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  {result.compatibility > 0 ? (
                    <BrandPill label={`❤️ ${Math.round(result.compatibility)} %`} style={styles.compat} />
                  ) : null}
                  <Text style={styles.cardName} numberOfLines={2}>{result.place.name}</Text>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardMeta}>
                    {meta.emoji} {universeLabel(t, result.place.universe)}{ratingSuffix(result.place.rating)}
                    {result.place.city ? ` · ${result.place.city}` : ''}
                  </Text>
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonIcon}>✨</Text>
                    <Text style={styles.cardReason}>{result.reason}</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <BrandButton label={t('sur_see_place')} onPress={goToDetail} style={styles.cardBtn} />
                    <OutlineButton label={t('sur_something_else')} onPress={spin} style={styles.cardBtn} />
                  </View>
                </View>
              </View>
            </FlipReveal>
          </Animated.View>
        ) : null}

        {spins > 0 ? (
          <Text style={styles.countHint}>
            {spins} {spins === 1 ? t('sur_draw_singular') : t('sur_draw_plural')}
            {spins >= 10 ? ' 🎉' : ''}
          </Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('sur_dice_universe_title')}</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={[styles.universeRow, universeFilter === null && styles.universeRowActive]}
                onPress={() => selectUniverse(null)}
              >
                <Text style={styles.universeRowEmoji}>🎲</Text>
                <Text style={styles.universeRowLabel}>{t('sur_all_universes').replace('🎲 ', '')}</Text>
                {universeFilter === null && <BrandDot label="✓" size={22} />}
              </Pressable>

              {UNIVERSE_CATEGORIES.map((cat) => (
                <View key={cat.key} style={styles.categoryBlock}>
                  <Text style={styles.categoryLabel}>{cat.emoji} {t(`category_${cat.key}` as never)}</Text>
                  {cat.universes.map((u) => (
                    <Pressable
                      key={u}
                      style={[styles.universeRow, universeFilter === u && styles.universeRowActive]}
                      onPress={() => selectUniverse(u)}
                    >
                      <Text style={styles.universeRowEmoji}>{UNIVERSE_META[u].emoji}</Text>
                      <Text style={styles.universeRowLabel}>{universeLabel(t, u)}</Text>
                      {universeFilter === u && <BrandDot label="✓" size={22} />}
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
  // Fond uni : l'espace profond (SurpriseBackdrop) est posé par-dessus.
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row' },

  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  heading: { fontSize: 36, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 22, fontWeight: '500' },

  tapHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: -spacing.sm },
  errorBox: {
    width: '100%', borderRadius: radius.md, padding: spacing.md,
    backgroundColor: 'rgba(14,14,18,0.78)', borderWidth: 1, borderColor: 'rgba(229,72,77,0.45)',
  },
  errorText: { fontSize: 14, color: '#FF9A9D', textAlign: 'center', fontWeight: '600' },

  universePicker: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(14,14,18,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  universePickerText: { fontSize: 14, color: colors.textPrimary, fontWeight: '800' },
  universePickerChevron: { color: colors.textMuted, fontSize: 12 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#121218',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3, backgroundColor: colors.brand,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: 19, fontWeight: '900', color: colors.textPrimary,
    textAlign: 'center', paddingBottom: spacing.sm,
  },
  categoryBlock: { marginTop: spacing.md },
  categoryLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: colors.textMuted, textTransform: 'uppercase',
    paddingBottom: spacing.xs, paddingHorizontal: spacing.sm,
  },
  universeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 11, paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  universeRowActive: { backgroundColor: 'rgba(232,98,26,0.12)' },
  universeRowEmoji: { fontSize: 18, width: 26 },
  universeRowLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },

  reveal: { width: '100%', alignItems: 'center', marginTop: spacing.sm },
  card: { width: '100%', borderRadius: radius.xl, overflow: 'hidden', ...GLASS_SURFACE, backgroundColor: 'rgba(23,23,31,0.92)' },
  cardPhoto: { height: 190, justifyContent: 'flex-end', padding: spacing.md, overflow: 'hidden' },
  cardPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  compat: { position: 'absolute', top: spacing.md, left: spacing.md },
  cardName: {
    color: '#fff', fontSize: 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 },
  },
  cardBody: { padding: spacing.md, gap: spacing.md },
  cardMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  reasonBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  reasonIcon: { fontSize: 16 },
  cardReason: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  cardBtn: { flex: 1, paddingHorizontal: spacing.sm },

  countHint: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },
});
