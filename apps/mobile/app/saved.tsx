/**
 * MES ADRESSES — liste complète des lieux sauvegardés.
 * Filtres par univers, pull-to-refresh, swipe-to-remove, tap → Place Detail.
 */
import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeMeta } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { useSavedPlaces } from '../lib/useSavedPlaces';
import { placeStore } from '../lib/place-store';
import type { SavedPlace } from '../lib/useSavedPlaces';

const ALL = '__all__';

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();
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
      reason: 'Lieu sauvegardé dans tes adresses.',
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  async function handleRemove(sp: SavedPlace) {
    Alert.alert(
      'Retirer de mes adresses ?',
      sp.place.name,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => void remove(sp.place.id),
        },
      ],
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mes adresses</Text>
        <Text style={styles.count}>{places.length}</Text>
      </View>

      {/* Filtres univers */}
      {universes.length > 1 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[ALL, ...universes]}
          keyExtractor={(u) => u}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const active = item === activeUniverse;
            const meta = item !== ALL ? safeMeta(item) : null;
            return (
              <Pressable
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setActiveUniverse(item)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {meta ? `${meta.emoji} ${meta.labelFr}` : 'Tous'}
                </Text>
              </Pressable>
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
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🤍</Text>
          <Text style={styles.emptyText}>
            {places.length === 0
              ? 'Aucune adresse sauvegardée pour l\'instant.'
              : 'Aucun lieu pour ce filtre.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(sp) => sp.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />
          }
          renderItem={({ item }) => {
            const meta = safeMeta(item.place.universe);
            const date = new Date(item.createdAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            });
            return (
              <Pressable style={styles.card} onPress={() => handleTap(item)}>
                <View style={styles.cardEmojiBg}>
                  <Text style={styles.cardEmoji}>{meta?.emoji ?? '📍'}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.place.name}</Text>
                  <Text style={styles.cardMeta}>
                    {meta?.labelFr ?? item.place.universe}
                    {' · '}⭐ {item.place.rating.toFixed(1)}
                    {item.place.city ? ` · ${item.place.city}` : ''}
                    {' · '}{date}
                  </Text>
                </View>
                <Pressable style={styles.removeBtn} onPress={() => void handleRemove(item)} hitSlop={8}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  count: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  filterRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  filterChipActive: { backgroundColor: `${colors.brand}18`, borderColor: colors.brand },
  filterText: { ...typography.caption, color: colors.textPrimary },
  filterTextActive: { color: colors.brandSoft },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorText: { ...typography.body, color: colors.danger },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { ...typography.caption, color: '#fff' },
  emptyEmoji: { fontSize: 56 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },

  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  cardEmojiBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardEmoji: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  cardMeta: { ...typography.caption, color: colors.textMuted, marginTop: 3 },
  removeBtn: { padding: spacing.xs },
  removeText: { ...typography.caption, color: colors.textMuted },
});
