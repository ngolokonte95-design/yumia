/**
 * EXPLORER — hub de découverte & catalogue. Distinct de Home (« quoi faire
 * maintenant ») : ici on parcourt, on cherche, on accède aux univers, aux
 * guides, aux sorties, au mode groupe et au classement.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { fetchBoostedVenues, type Venue } from '../../lib/business-api';

const QUICK_ACTIONS: { key: string; emoji: string; label: string; sub: string; route: string }[] = [
  { key: 'guides', emoji: '🧭', label: 'Guides locaux', sub: 'Experts certifiés', route: '/guides' },
  { key: 'sorties', emoji: '🎟️', label: 'Sorties & billets', sub: 'Événements près de toi', route: '/sorties' },
  { key: 'group', emoji: '👥', label: 'Sortie en groupe', sub: 'Décidez ensemble', route: '/group' },
  { key: 'surprise', emoji: '🎲', label: 'Surprise Me', sub: 'L\'IA choisit', route: '/surprise' },
  { key: 'leaderboard', emoji: '🏆', label: 'Classement', sub: 'Compare-toi', route: '/leaderboard' },
  { key: 'saved', emoji: '🤍', label: 'Sauvegardés', sub: 'Tes adresses', route: '/saved' },
];

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    fetchBoostedVenues().then((v) => setVenues(v.slice(0, 6))).catch(() => {});
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Titre */}
      <View style={styles.section}>
        <Text style={styles.h1}>Explorer</Text>
        <Text style={styles.sub}>Parcours, cherche, et trouve l'expérience parfaite.</Text>
      </View>

      {/* Recherche */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchText}>Dis-moi ce que tu cherches…</Text>
        </Pressable>
      </View>

      {/* Accès rapides */}
      <View style={styles.section}>
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable key={a.key} style={styles.actionCard} onPress={() => router.push(a.route as never)}>
              <Text style={styles.actionEmoji}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Sorties à la une */}
      {venues.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🎟️ Sorties à la une</Text>
            <Pressable onPress={() => router.push('/sorties' as never)}>
              <Text style={styles.seeAll}>Tout voir</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {venues.map((v) => (
              <Pressable key={v.id} style={styles.eventCard} onPress={() => router.push('/sorties' as never)}>
                <View style={styles.eventTop}>
                  {v.boostLevel >= 3 ? <Text style={styles.hot}>🔥</Text> : null}
                  <Text style={styles.eventVenue} numberOfLines={1}>{v.name}</Text>
                </View>
                <Text style={styles.eventName} numberOfLines={2}>{v.eventName}</Text>
                <Text style={styles.eventMeta}>{v.city} · {v.ticketPrice != null ? `${v.ticketPrice}€` : 'Gratuit'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Catalogue d'univers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tous les univers</Text>
        <View style={styles.universeGrid}>
          {UNIVERSES.map((u) => (
            <Pressable key={u} style={styles.universeCard} onPress={() => router.push(`/universe?u=${u}`)}>
              <Text style={styles.universeEmoji}>{UNIVERSE_META[u].emoji}</Text>
              <Text style={styles.universeLabel}>{UNIVERSE_META[u].labelFr}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  h1: { ...typography.display, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  searchIcon: { fontSize: 16 },
  searchText: { ...typography.body, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionCard: {
    width: '31.5%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 2, minHeight: 96, justifyContent: 'center',
  },
  actionEmoji: { fontSize: 26 },
  actionLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', marginTop: 4 },
  actionSub: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
  seeAll: { ...typography.caption, color: colors.brandSoft },
  row: { gap: spacing.md, paddingRight: spacing.md },
  eventCard: {
    width: 180, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: 4,
  },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hot: { fontSize: 13 },
  eventVenue: { ...typography.label, color: colors.textMuted, flex: 1 },
  eventName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  eventMeta: { ...typography.caption, color: colors.brandSoft, marginTop: 2 },

  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  universeCard: {
    width: '22.5%', aspectRatio: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  universeEmoji: { fontSize: 26 },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', fontSize: 10 },
});
