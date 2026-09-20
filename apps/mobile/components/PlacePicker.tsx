/**
 * Choix du lieu associé à une publication, un reel ou une story.
 *
 * Deux façons de trouver un lieu, comme sur Instagram :
 *   - la liste des lieux autour de soi, proposée d'emblée ;
 *   - la recherche par nom, dès qu'on tape.
 *
 * On renvoie un `placeId` de la base YUMIA, jamais du texte libre : le lieu
 * devient alors cliquable dans le fil et relie la publication à sa fiche, à ses
 * avis et à ses autres publications.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNearby, searchPlacesByName, type NearbyPlace } from '../lib/places-api';
import { useLocation } from '../lib/useLocation';
import { safeMeta } from '../lib/universeMeta';
import { useI18n } from '../lib/useI18n';
import { colors, radius, spacing, typography } from '../theme/tokens';

/** Ce qu'on garde d'un lieu choisi — assez pour l'afficher sans le recharger. */
export interface PickedPlace {
  id: string;
  name: string;
  city?: string;
  universe?: string;
}

/** Distance lisible : « 250 m », « 1,4 km ». */
function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function PlacePicker({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (place: PickedPlace) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { coords, status } = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  // Identifie la dernière requête lancée : une réponse plus ancienne qui
  // arrive après ne doit pas écraser des résultats plus récents.
  const lastRun = useRef(0);

  const near = status === 'granted' ? { lat: coords.lat, lng: coords.lng } : undefined;

  const run = useCallback(async (q: string) => {
    const run$ = ++lastRun.current;
    setLoading(true);
    try {
      const list = q.trim().length >= 2
        ? await searchPlacesByName(q.trim(), near, 25)
        : near
          ? await fetchNearby({ lat: near.lat, lng: near.lng, radius: 5000, limit: 25 })
          : [];
      if (run$ === lastRun.current) setResults(list);
    } catch {
      if (run$ === lastRun.current) setResults([]);
    } finally {
      if (run$ === lastRun.current) setLoading(false);
    }
  }, [near]);

  // Lieux proches dès l'ouverture, puis recherche différée pendant la frappe :
  // sans ce délai, chaque lettre déclencherait un appel réseau.
  useEffect(() => {
    if (!visible) return undefined;
    const delay = query.trim().length >= 2 ? 350 : 0;
    const timer = setTimeout(() => void run(query), delay);
    return () => clearTimeout(timer);
  }, [visible, query, run]);

  // Repartir propre à chaque ouverture plutôt que de rouvrir sur la recherche
  // précédente, qui n'a plus de rapport avec la publication en cours.
  useEffect(() => { if (!visible) { setQuery(''); setResults([]); } }, [visible]);

  const denied = status === 'denied' && query.trim().length < 2;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('place_tag_title')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            placeholder={t('place_tag_search')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />

          {query.trim().length < 2 && !denied ? (
            <Text style={styles.sectionLabel}>{t('place_tag_nearby')}</Text>
          ) : null}

          {loading && results.length === 0 ? (
            <ActivityIndicator style={styles.spinner} color={colors.brand} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {denied ? t('place_tag_permission') : t('place_tag_none')}
                </Text>
              }
              renderItem={({ item }) => {
                const meta = safeMeta(item.universe);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => {
                      onSelect({ id: item.id, name: item.name, city: item.city, universe: item.universe });
                      onClose();
                    }}
                  >
                    <Text style={styles.rowEmoji}>{meta?.emoji ?? '📍'}</Text>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowCity} numberOfLines={1}>
                        {[item.city, formatDistance(item.distanceMeters)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  // Hauteur fixe : la liste ne doit pas faire sauter la feuille à chaque
  // changement de résultats.
  sheet: {
    height: '75%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title, color: colors.textPrimary },
  close: { ...typography.title, color: colors.textSecondary },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
  spinner: { marginTop: spacing.xl },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowEmoji: { fontSize: 22 },
  rowText: { flex: 1 },
  rowName: { ...typography.body, color: colors.textPrimary },
  rowCity: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
