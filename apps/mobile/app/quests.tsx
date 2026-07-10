import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface Quest {
  id: string;
  title: string;
  description: string;
  emoji: string;
  type: string;
  target: number;
  xpReward: number;
  progress: number;
  completed: boolean;
  completedAt?: string;
}

function QuestCard({ quest }: { quest: Quest }) {
  const pct = Math.min((quest.progress / quest.target) * 100, 100);
  return (
    <View style={[styles.card, quest.completed && styles.cardDone]}>
      <View style={styles.cardLeft}>
        <Text style={styles.emoji}>{quest.emoji}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{quest.title}</Text>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+{quest.xpReward} XP</Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>{quest.description}</Text>
        <View style={styles.progressWrap}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as `${number}%` }, quest.completed && styles.progressDone]} />
          </View>
          <Text style={styles.progressText}>
            {quest.completed ? '✅ Complété !' : `${quest.progress}/${quest.target}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function QuestsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API}/quests`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setQuests(await res.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const filtered = quests.filter((q) => {
    if (filter === 'active') return !q.completed;
    if (filter === 'done') return q.completed;
    return true;
  });

  const doneCount = quests.filter((q) => q.completed).length;
  const totalXp = quests.filter((q) => q.completed).reduce((s, q) => s + q.xpReward, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Quêtes</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{doneCount}/{quests.length}</Text>
          <Text style={styles.statLabel}>Complétées</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{totalXp}</Text>
          <Text style={styles.statLabel}>XP gagnés</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {(['all', 'active', 'done'] as const).map((f) => (
          <Pressable key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'Toutes' : f === 'active' ? 'En cours' : 'Terminées'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(q) => q.id}
          renderItem={({ item }) => <QuestCard quest={item} />}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🏆</Text>
              <Text style={styles.emptyText}>Aucune quête ici</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  statsRow: { flexDirection: 'row', margin: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { ...typography.h2, color: colors.brand },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  filterChip: { borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: colors.border },
  cardDone: { opacity: 0.7, borderColor: colors.success },
  cardLeft: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, borderRadius: radius.md },
  emoji: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontWeight: '700', color: colors.text, fontSize: 15, flex: 1 },
  xpBadge: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  xpText: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBg: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 3 },
  progressDone: { backgroundColor: colors.success },
  progressText: { fontSize: 11, color: colors.textMuted, minWidth: 60, textAlign: 'right' },
  emptyText: { color: colors.textMuted, fontSize: 16 },
});
