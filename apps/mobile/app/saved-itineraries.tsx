/**
 * MES ITINÉRAIRES — liste des itinéraires IA enregistrés par l'utilisateur,
 * pour les reconsulter sans avoir à les régénérer.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { fetchSavedItineraries, type SavedItinerary } from '../lib/itinerary-api';
import { safeMoodMeta } from '../lib/itinerary-meta';
import { savedItineraryStore } from '../lib/saved-itinerary-store';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function SavedItinerariesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📚 Mes itinéraires</Text>
          <Text style={styles.subtitle}>Retrouve tes plans enregistrés</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyText}>Aucun itinéraire enregistré pour l'instant.</Text>
          <Text style={styles.emptySubtext}>Génère un itinéraire puis appuie sur "Enregistrer" pour le retrouver ici.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const meta = safeMoodMeta(item.mood);
            return (
              <Pressable style={styles.card} onPress={() => openDetail(item)}>
                <View style={[styles.emojiBadge, { backgroundColor: meta.color }]}>
                  <Text style={styles.emojiBadgeText}>{meta.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{meta.label} · {item.city}</Text>
                  <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
                  <Text style={styles.cardMeta}>{item.steps.length} étapes · {fmtDate(item.createdAt)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { paddingTop: 2 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 24 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { ...typography.h3, color: colors.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm, alignItems: 'center',
  },
  emojiBadge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emojiBadgeText: { fontSize: 22 },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  cardSummary: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  cardMeta: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
});
