/**
 * Détail d'un itinéraire enregistré — vue lecture seule des étapes déjà
 * générées (pas de régénération), avec suppression et accès aux fiches lieu.
 */
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { deleteSavedItinerary, type ItineraryStep } from '../lib/itinerary-api';
import { safeMoodMeta } from '../lib/itinerary-meta';
import { savedItineraryStore } from '../lib/saved-itinerary-store';
import { placeStore } from '../lib/place-store';
import { useI18n } from '../lib/useI18n';
import { itineraryMoodLabel } from '../lib/labelHelpers';

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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('place_back')}</Text>
        </Pressable>
      </View>
    );
  }

  const meta = safeMoodMeta(item.mood);

  const moodLabel = itineraryMoodLabel(t, item.mood, meta.label);

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: meta.color }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
          <Text style={styles.headerBackText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{meta.emoji}</Text>
          <View>
            <Text style={styles.headerTitle}>{moodLabel}</Text>
            <Text style={styles.headerSub}>{item.city}</Text>
          </View>
        </View>
        <Pressable onPress={() => void shareItinerary()} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>↑</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={[styles.summaryBox, { borderLeftColor: meta.color }]}>
          <Text style={styles.summaryText}>{item.summary}</Text>
        </View>

        {item.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.timeline}>
              <View style={[styles.dot, { backgroundColor: meta.color }]}>
                <Text style={styles.dotEmoji}>{step.emoji}</Text>
              </View>
              {i < item.steps.length - 1 && <View style={[styles.line, { backgroundColor: meta.color + '30' }]} />}
            </View>

            <View style={styles.stepCard}>
              {step.placePhoto ? <Image source={{ uri: step.placePhoto }} style={styles.stepPhoto} resizeMode="cover" /> : null}
              <View style={styles.stepBody}>
                <View style={styles.stepTopRow}>
                  <Text style={[styles.stepTime, { color: meta.color }]}>{step.time}</Text>
                  <Text style={styles.stepDuration}>{step.duration}</Text>
                </View>
                <Text style={styles.stepName}>{step.name}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
                {step.tips ? (
                  <View style={[styles.tipBox, { borderLeftColor: meta.color }]}>
                    <Text style={styles.tipText}>💡 {step.tips}</Text>
                  </View>
                ) : null}
                {step.placeId ? (
                  <Pressable style={[styles.placeBtn, { borderColor: meta.color }]} onPress={() => navigateToPlace(step)}>
                    <Text style={[styles.placeBtnText, { color: meta.color }]}>{t('itin_see_place')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))}

        <Pressable style={[styles.deleteBtn, deleting && { opacity: 0.6 }]} onPress={handleDelete} disabled={deleting}>
          <Text style={styles.deleteBtnText}>{deleting ? t('sid_deleting') : t('sid_delete_btn')}</Text>
        </Pressable>
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

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 14, gap: spacing.sm },
  headerBackBtn: { padding: 4 },
  headerBackText: { fontSize: 22, color: '#fff', fontWeight: '700' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 26 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },

  summaryBox: { borderLeftWidth: 4, paddingLeft: 14, marginBottom: spacing.lg },
  summaryText: { fontSize: 15, color: colors.text, lineHeight: 22, fontStyle: 'italic' },

  step: { flexDirection: 'row', gap: 12 },
  timeline: { alignItems: 'center', width: 44 },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dotEmoji: { fontSize: 20 },
  line: { width: 2, flex: 1, minHeight: 20 },

  stepCard: { flex: 1, marginBottom: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stepPhoto: { width: '100%', height: 120 },
  stepBody: { padding: 12, gap: 4 },
  stepTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepTime: { fontSize: 12, fontWeight: '700' },
  stepDuration: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stepName: { fontSize: 16, fontWeight: '700', color: colors.text },
  stepDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  tipBox: { borderLeftWidth: 3, paddingLeft: 10, marginTop: 4, backgroundColor: colors.background, paddingVertical: 4, borderRadius: 4 },
  tipText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', lineHeight: 16 },
  placeBtn: { marginTop: 8, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' },
  placeBtnText: { fontSize: 13, fontWeight: '700' },

  deleteBtn: { marginTop: spacing.md, alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  deleteBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
});
