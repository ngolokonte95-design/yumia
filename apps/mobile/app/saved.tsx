/**
 * MES ADRESSES — liste complète des lieux sauvegardés.
 * Filtres par univers, pull-to-refresh, swipe-to-remove, tap → Place Detail.
 *
 * DA (18/11/2026) : titre dégradé avec le nombre d'adresses en pastille,
 * filtres en pastilles qui se remplissent du dégradé, adresses en cartes
 * vitrées (icône de l'univers en médaillon, retrait en rond de verre),
 * apparition en cascade. Logique inchangée.
 */
import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeMeta, universeLabel } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { useSavedPlaces } from '../lib/useSavedPlaces';
import { placeStore } from '../lib/place-store';
import type { SavedPlace } from '../lib/useSavedPlaces';
import { ratingSuffix } from '../lib/place-rating';
import { PressableScale, Reveal } from '../components/ui';
import { UniverseGlyph } from '../components/UniverseGlyph';
import { BrandButton, BrandChip, SocialEmpty, SocialHeader } from '../components/social/SocialChrome';
import { BACK_ICON, GLASS_CARD, GlassDot, IconMedal, InfoPill } from '../components/p2a/P2Chrome';
import { haptics } from '../lib/useHaptics';

const ALL = '__all__';
const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const { places, loading, error, reload, remove } = useSavedPlaces(accessToken);
  const [activeUniverse, setActiveUniverse] = useState<string>(ALL);

  // Univers présents dans les sauvegardes
  const universes = useMemo(() => {
    const set = new Set(places.map((p) => p.place.universe));
    return Array.from(set);
  }, [places]);

  const filtered = useMemo(
    () => (activeUniverse === ALL ? places : places.filter((p) => p.place.universe === activeUniverse)),
    [places, activeUniverse],
  );

  function handleTap(sp: SavedPlace) {
    placeStore.set({
      place: {
        id: sp.place.id,
        name: sp.place.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        universe: sp.place.universe as any,
        location: { lat: 0, lng: 0 },
        city: sp.place.city ?? '',
        countryCode: sp.place.countryCode,
        rating: sp.place.rating,
        priceTier: (Math.min(4, Math.max(1, sp.place.priceTier))) as 1 | 2 | 3 | 4,
        photoUrls: [],
        tags: sp.place.tags,
      },
      compatibility: 0,
      reason: t('saved_place_reason'),
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  async function handleRemove(sp: SavedPlace) {
    Alert.alert(
      t('saved_remove_confirm_title'),
      sp.place.name,
      [
        { text: t('saved_cancel'), style: 'cancel' },
        {
          text: t('saved_remove'),
          style: 'destructive',
          onPress: () => void remove(sp.place.id),
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <SocialHeader
        title={t('saved_title')}
        onBack={() => router.back()}
        backIcon={BACK_ICON}
        right={places.length > 0 ? <InfoPill label={String(places.length)} brand /> : undefined}
      />

      {/* Filtres univers */}
      {universes.length > 1 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[ALL, ...universes]}
          keyExtractor={(u) => u}
          style={styles.filterBar}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const active = item === activeUniverse;
            const meta = item !== ALL ? safeMeta(item) : null;
            return (
              <BrandChip
                active={active}
                label={meta && item !== ALL ? `${meta.emoji} ${universeLabel(t, item)}` : t('saved_filter_all')}
                onPress={() => { haptics.select(); setActiveUniverse(item); }}
              />
            );
          }}
        />
      ) : null}

      {/* États */}
      {loading && places.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <SocialEmpty
            emoji="📡"
            title={error}
            action={<BrandButton label={t('retry')} onPress={reload} compact />}
          />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <SocialEmpty
            emoji="🤍"
            title={places.length === 0 ? t('saved_empty_none') : t('saved_empty_filter')}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(sp) => sp.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />
          }
          renderItem={({ item, index }) => {
            const date = new Date(item.createdAt).toLocaleDateString(INTL_LOCALE[locale] ?? 'fr-FR', {
              day: 'numeric',
              month: 'short',
            });
            return (
              <Reveal index={Math.min(index, 8)} from="fade">
                <PressableScale style={[styles.card, GLASS_CARD]} scaleTo={0.98} onPress={() => handleTap(item)}>
                  <IconMedal icon={<UniverseGlyph u={item.place.universe} size={26} />} size={54} />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.place.name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {universeLabel(t, item.place.universe)}
                      {ratingSuffix(item.place.rating)}
                      {item.place.city ? ` · ${item.place.city}` : ''}
                    </Text>
                    <InfoPill label={`🔖 ${date}`} style={styles.datePill} />
                  </View>
                  <GlassDot label="✕" onPress={() => void handleRemove(item)} />
                </PressableScale>
              </Reveal>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  filterBar: { flexGrow: 0 },
  filterRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  card: {
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  cardBody: { flex: 1, gap: 3 },
  cardName: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  datePill: { marginTop: 4 },
});
