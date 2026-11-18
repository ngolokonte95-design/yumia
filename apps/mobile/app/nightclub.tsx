/**
 * NIGHT-CLUBS — lieux de nuit avec filtre d'ambiance.
 *
 * Habillage du 18/11/2026 : sobre. Chaque lieu est une grande carte photo
 * (voile confiné à la photo), les ambiances sont des pastilles sans couleur
 * (blanc quand choisie). Aucun dégradé de marque sur cet écran.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { fetchNearby, type NearbyPlace } from '../lib/places-api';
import { placeStore } from '../lib/place-store';
import { PlacePhoto } from '../components/PlacePhoto';
import { universeSearchRadius } from '../lib/universeRadius';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { ratingPrefix } from '../lib/place-rating';
import { PressableScale, Reveal } from '../components/ui';
import { PB_CHEVRON, PbChip, PbEmpty, PbHeader } from '../components/pb1/PbChrome';

const AMBIANCES: { key: string; labelKey: TranslationKey; emoji: string }[] = [
  { key: 'all', labelKey: 'nc_ambiance_all', emoji: '🎧' },
  { key: 'afro', labelKey: 'nc_ambiance_afro', emoji: '🌴' },
  { key: 'electro', labelKey: 'nc_ambiance_electro', emoji: '⚡' },
  { key: 'techno', labelKey: 'nc_ambiance_techno', emoji: '🔊' },
  { key: 'hiphop', labelKey: 'nc_ambiance_hiphop', emoji: '🎤' },
  { key: 'rnb', labelKey: 'nc_ambiance_rnb', emoji: '🎵' },
  { key: 'latin', labelKey: 'nc_ambiance_latin', emoji: '🎺' },
  { key: 'variete', labelKey: 'nc_ambiance_variete', emoji: '🎶' },
];

export default function NightclubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords, resolving } = useLocation();
  const { t } = useI18n();
  const [ambiance, setAmbiance] = useState('all');
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (resolving) return;
    setLoading(true);
    fetchNearby({ lat: coords.lat, lng: coords.lng, radius: universeSearchRadius('nightclub'), universe: 'nightclub', limit: 30 })
      .then(setPlaces)
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [coords.lat, coords.lng, resolving]);

  // Filtre côté client par tag d'ambiance
  const filtered = ambiance === 'all'
    ? places
    : places.filter((p) => p.tags.some((tag) => tag.toLowerCase().includes(ambiance)));

  function openDetail(place: NearbyPlace) {
    placeStore.set({
      place: {
        id: place.id,
        name: place.name,
        universe: place.universe,
        location: { lat: place.lat, lng: place.lng },
        city: place.city,
        countryCode: place.countryCode,
        rating: place.rating,
        priceTier: place.priceTier as 1 | 2 | 3 | 4,
        photoUrls: place.photoUrls,
        tags: place.tags,
      },
      compatibility: 0,
      distanceMeters: place.distanceMeters,
      reason: t('nc_reason'),
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PbHeader
        title={t('nc_title')}
        subtitle={t('nc_subtitle')}
        onBack={() => router.back()}
        style={styles.header}
      />

      {/* Filtre ambiance */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ambianceRow}>
          {AMBIANCES.map((a) => (
            <PbChip
              key={a.key}
              emoji={a.emoji}
              label={t(a.labelKey)}
              active={ambiance === a.key}
              onPress={() => setAmbiance(a.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading || resolving ? (
        <View style={styles.center}><ActivityIndicator color={colors.textPrimary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <PbEmpty emoji="🎧" title={t('nc_empty_title')} text={t('nc_empty_hint')} />
          ) : (
            filtered.map((place, i) => {
              const card = (
                <PressableScale key={place.id} style={styles.card} onPress={() => openDetail(place)} scaleTo={0.97}>
                  <PlacePhoto
                    photoUrls={place.photoUrls}
                    emoji={UNIVERSE_META[place.universe]?.emoji ?? '🎧'}
                    emojiSize={64}
                    scrim
                  />
                  <View style={styles.cardTop}>
                    <View style={styles.cardGo}>
                      <Text style={styles.cardGoText}>{PB_CHEVRON}</Text>
                    </View>
                  </View>
                  {/* Bandeau sombre confiné au bas de la photo : le texte reste lisible. */}
                  <View style={styles.cardBottom}>
                    <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {ratingPrefix(place.rating)}{place.city}
                      {place.distanceMeters > 0 ? ` · ${place.distanceMeters < 1000 ? `${Math.round(place.distanceMeters)} m` : `${(place.distanceMeters / 1000).toFixed(1)} km`}` : ''}
                    </Text>
                    {place.tags.length > 0 ? (
                      <Text style={styles.cardTags} numberOfLines={1}>
                        {place.tags.slice(0, 4).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </PressableScale>
              );
              // Cascade sur les premières cartes seulement.
              return i < 4 ? <Reveal key={place.id} index={i}>{card}</Reveal> : card;
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: spacing.sm },
  ambianceRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.md, paddingBottom: 80 },
  card: {
    height: 196,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'space-between',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.md },
  cardGo: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.6)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)',
  },
  cardGoText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -3 },
  cardBottom: {
    paddingHorizontal: spacing.md, paddingVertical: 12, gap: 2,
    backgroundColor: 'rgba(14,14,18,0.72)',
  },
  cardName: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  cardMeta: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
  cardTags: { ...typography.label, color: 'rgba(255,255,255,0.6)', fontSize: 11 },
});
