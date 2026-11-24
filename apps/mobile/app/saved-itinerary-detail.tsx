/**
 * Détail d'un itinéraire enregistré — vue lecture seule des étapes déjà
 * générées (pas de régénération), avec suppression et accès aux fiches lieu.
 *
 * Mise en scène (17/11/2026) : grande photo de couverture (photo de la
 * première étape qui en a une), boutons vitrés, résumé chiffré, puis la même
 * frise animée que l'écran de génération. Une seule couleur d'accent : le
 * dégradé de marque.
 */
import { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { deleteSavedItinerary, type ItineraryStep } from '../lib/itinerary-api';
import { safeMoodMeta } from '../lib/itinerary-meta';
import { savedItineraryStore } from '../lib/saved-itinerary-store';
import { placeStore } from '../lib/place-store';
import { useI18n } from '../lib/useI18n';
import { itineraryMoodLabel } from '../lib/labelHelpers';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { ItinerarySummary, ItineraryTimeline, stepsTimeRange } from '../components/itinerary/ItineraryTimeline';
import { findBudget } from '../components/itinerary/options';

const COVER_HEIGHT = 240;

export default function SavedItineraryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const item = savedItineraryStore.get();
  const [deleting, setDeleting] = useState(false);

  if (!item) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{t('sid_not_found')}</Text>
        <PressableScale onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('place_back')}</Text>
        </PressableScale>
      </View>
    );
  }

  const meta = safeMoodMeta(item.mood);

  const moodLabel = itineraryMoodLabel(t, item.mood, meta.label);
  const cover = item.steps.find((s) => s.placePhoto)?.placePhoto;
  const budgetOpt = findBudget(item.budget);

  const shareItinerary = async () => {
    const text = [
      `${meta.emoji} Itinéraire ${moodLabel} — ${item.city}`,
      '',
      item.summary,
      '',
      ...item.steps.map((s) => `${s.time} ${s.emoji} ${s.name} (${s.duration})\n  ${s.description}`),
      '',
      t('itin_generated_by'),
    ].join('\n');
    await Share.share({ message: text }).catch(() => undefined);
  };

  const handleDelete = () => {
    Alert.alert(t('sid_delete_confirm_title'), t('sid_delete_confirm_body'), [
      { text: t('sid_cancel'), style: 'cancel' },
      {
        text: t('sid_delete'), style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          setDeleting(true);
          try {
            await deleteSavedItinerary(accessToken, item.id);
            router.back();
          } catch {
            Alert.alert(t('sid_error'), t('sid_delete_error'));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const navigateToPlace = (step: ItineraryStep) => {
    if (!step.placeId) return;
    placeStore.set({
      place: {
        id: step.placeId,
        name: step.name,
        universe: step.type as never,
        location: { lat: step.placeLat ?? 0, lng: step.placeLng ?? 0 },
        city: item.city,
        countryCode: 'FR',
        rating: step.placeRating ?? 0,
        priceTier: 2,
        photoUrls: step.placePhoto ? [step.placePhoto] : [],
        tags: [],
      },
      compatibility: 0,
      distanceMeters: 0,
      reason: `${step.emoji} ${t('sid_step_of').replace('{mood}', moodLabel)}`,
      engine: 'mood',
    });
    router.push('/place');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      >
        {/* Couverture : vraie photo d'étape, ou aplat sobre avec l'emoji. */}
        <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.coverEmpty}>
              <Text style={styles.coverEmoji}>{meta.emoji}</Text>
            </View>
          )}
          <View style={[styles.coverBar, { top: insets.top + spacing.sm }]}>
            <PressableScale onPress={() => router.back()} style={styles.glassBtn} hitSlop={6}>
              <Text style={styles.glassBtnText}>←</Text>
            </PressableScale>
            <PressableScale onPress={() => void shareItinerary()} style={styles.glassBtn} hitSlop={6}>
              <Text style={styles.glassBtnText}>↑</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.content}>
          <Reveal index={0} style={styles.titleBlock}>
            <View style={styles.moodPill}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.moodPillText} numberOfLines={1}>{meta.emoji}  {moodLabel}</Text>
            </View>
            <GradientText style={styles.title}>{item.city}</GradientText>
          </Reveal>

          <ItinerarySummary
            summary={item.summary}
            stepCount={item.steps.length}
            timeRange={stepsTimeRange(item.steps)}
            stepsLabel={t('si_steps_count').replace('{n}', '').trim()}
            budget={budgetOpt ? { emoji: budgetOpt.emoji, label: t(budgetOpt.labelKey as never) } : undefined}
          />

          <ItineraryTimeline
            steps={item.steps}
            renderActions={(step) => (step.placeId ? (
              <PressableScale style={styles.placeBtn} onPress={() => navigateToPlace(step)}>
                <Text style={styles.placeBtnText}>{t('itin_see_place')}</Text>
              </PressableScale>
            ) : null)}
          />

          <PressableScale style={[styles.deleteBtn, deleting && { opacity: 0.6 }]} onPress={handleDelete} disabled={deleting}>
            <Text style={styles.deleteBtnText}>{deleting ? t('sid_deleting') : t('sid_delete_btn')}</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorText: { color: colors.textMuted, fontSize: 15 },
  backBtn: { padding: 8 },
  backText: { color: colors.brand, fontWeight: '700' },

  cover: { backgroundColor: colors.surfaceElevated },
  coverEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coverEmoji: { fontSize: 72 },
  coverBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  glassBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.6)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  glassBtnText: { fontSize: 18, color: '#fff', fontWeight: '800' },

  // La fiche remonte légèrement sur la photo, bord arrondi.
  content: {
    marginTop: -radius.xl, paddingTop: spacing.lg, paddingHorizontal: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    backgroundColor: colors.background,
  },
  titleBlock: { gap: spacing.sm, marginBottom: spacing.lg },
  moodPill: {
    alignSelf: 'flex-start', overflow: 'hidden', borderRadius: radius.pill,
    paddingVertical: 5, paddingHorizontal: 12,
  },
  moodPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },

  placeBtn: {
    marginTop: 6, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: `${colors.brand}88`,
  },
  placeBtnText: { fontSize: 13, fontWeight: '800', color: colors.brandSoft },

  deleteBtn: {
    marginTop: spacing.sm, alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: `${colors.danger}88`, backgroundColor: colors.surface,
  },
  deleteBtnText: { ...typography.body, color: colors.danger, fontWeight: '800', fontSize: 14 },
});
