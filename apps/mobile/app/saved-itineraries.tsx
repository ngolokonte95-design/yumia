/**
 * MES ITINÉRAIRES — liste des itinéraires IA enregistrés par l'utilisateur,
 * pour les reconsulter sans avoir à les régénérer.
 *
 * Mise en scène (17/11/2026) : grandes cartes photo (photo de la première
 * étape qui en a une), apparition en cascade, une seule couleur d'accent —
 * le dégradé de marque.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { fetchSavedItineraries, type SavedItinerary } from '../lib/itinerary-api';
import { safeMoodMeta } from '../lib/itinerary-meta';
import { savedItineraryStore } from '../lib/saved-itinerary-store';
import { useI18n } from '../lib/useI18n';
import { itineraryMoodLabel } from '../lib/labelHelpers';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { stepsTimeRange } from '../components/itinerary/ItineraryTimeline';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function SavedItinerariesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const [items, setItems] = useState<SavedItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setItems(await fetchSavedItineraries(accessToken));
    } catch {
      // silencieux — liste vide en cas d'erreur réseau
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  function openDetail(item: SavedItinerary) {
    savedItineraryStore.set(item);
    router.push('/saved-itinerary-detail' as never);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} style={styles.glassBtn} hitSlop={6}>
          <Text style={styles.glassBtnText}>←</Text>
        </PressableScale>
        <View style={styles.headerText}>
          <GradientText style={styles.title}>{t('si_title')}</GradientText>
          <Text style={styles.subtitle}>{t('si_subtitle')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Reveal index={0} style={styles.emptyMedal}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.emptyEmoji}>🗺️</Text>
          </Reveal>
          <Reveal index={1}><Text style={styles.emptyText}>{t('si_empty_title')}</Text></Reveal>
          <Reveal index={2}><Text style={styles.emptySubtext}>{t('si_empty_sub')}</Text></Reveal>
          <Reveal index={3}>
            <PressableScale style={styles.emptyCta} onPress={() => router.push('/itinerary' as never)} haptic>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.emptyCtaText}>{t('itin_generate_btn')}</Text>
            </PressableScale>
          </Reveal>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 6)}>
              <ItineraryCard item={item} onPress={() => openDetail(item)} moodLabel={itineraryMoodLabel(t, item.mood, safeMoodMeta(item.mood).label)} stepsText={t('si_steps_count').replace('{n}', String(item.steps.length))} />
            </Reveal>
          )}
        />
      )}
    </View>
  );
}

function ItineraryCard({
  item, onPress, moodLabel, stepsText,
}: {
  item: SavedItinerary;
  onPress: () => void;
  moodLabel: string;
  stepsText: string;
}) {
  const meta = safeMoodMeta(item.mood);
  // Couverture : la photo de la première étape qui en a une (vraie photo de
  // lieu, rien d'inventé) ; sinon un aplat sobre avec l'emoji de l'humeur.
  const cover = item.steps.find((s) => s.placePhoto)?.placePhoto;
  const range = stepsTimeRange(item.steps);

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.97}>
      <View style={styles.cover}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.coverEmpty}>
            <Text style={styles.coverEmoji}>{meta.emoji}</Text>
          </View>
        )}
        {/* Pastilles vitrées sur la photo : humeur à gauche, horaires à droite. */}
        <View style={styles.coverTop}>
          <View style={styles.glassPill}>
            <Text style={styles.glassPillText} numberOfLines={1}>{meta.emoji}  {moodLabel}</Text>
          </View>
          {range ? (
            <View style={styles.glassPill}>
              <Text style={styles.glassPillText}>🕐 {range}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.city}</Text>
        <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
        <View style={styles.cardMetaRow}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardDot} />
          <Text style={styles.cardMeta}>{stepsText} · {fmtDate(item.createdAt)}</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  glassBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  glassBtnText: { fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 12 },
  emptyMedal: {
    width: 88, height: 88, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm, ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 40 },
  emptyText: { ...typography.h3, color: colors.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  emptyCta: {
    marginTop: spacing.md, borderRadius: radius.pill, overflow: 'hidden',
    paddingVertical: 14, paddingHorizontal: spacing.lg, alignItems: 'center',
  },
  emptyCtaText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  list: { paddingHorizontal: spacing.md, gap: spacing.md },
  card: {
    borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    ...elevation.medium,
  },
  cover: { height: 160, backgroundColor: colors.surfaceElevated },
  coverEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 56, opacity: 0.9 },
  coverTop: {
    position: 'absolute', top: spacing.sm, left: spacing.sm, right: spacing.sm,
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm,
  },
  glassPill: {
    flexShrink: 1, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.6)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  glassPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  cardBody: { padding: spacing.md, gap: 4 },
  cardTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  cardSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cardDot: { width: 8, height: 8, borderRadius: 4 },
  cardMeta: { flex: 1, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  cardArrow: { fontSize: 22, color: colors.brandSoft, fontWeight: '800', marginTop: -3 },
});
