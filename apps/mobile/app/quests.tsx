/**
 * QUÊTES — défis à accomplir, récompensés en XP. Branché sur GET /quests.
 *
 * Mise en scène (18/11/2026) : anneau de progression global au dégradé de
 * marque (quêtes terminées) et XP gagnés qui défilent ; chaque quête a son
 * anneau autour de l'emoji, une jauge qui se remplit et la récompense XP en
 * pastille dégradée. Une seule couleur d'accent (y compris pour les quêtes
 * terminées) ; aucun voile dégradé sur le fond.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { haptics } from '../lib/useHaptics';
import { Reveal } from '../components/ui';
import { BrandChip } from '../components/social/SocialChrome';
import { BrandFrame, CountUp } from '../components/profile/ProfileChrome';
import {
  BrandPill, GLASS_SURFACE, GradientBar, P2Empty, P2Header, ProgressRing,
} from '../components/p2c/P2Visuals';

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

function QuestCard({ quest, index }: { quest: Quest; index: number }) {
  const { t } = useI18n();
  const pct = Math.min((quest.progress / quest.target) * 100, 100);
  const body = (
    <View style={styles.cardInner}>
      <ProgressRing size={60} stroke={5} progress={pct / 100} delay={120 + Math.min(index, 6) * 60}>
        <Text style={styles.emoji}>{quest.emoji}</Text>
      </ProgressRing>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>{quest.title}</Text>
          <BrandPill label={`+${quest.xpReward} XP`} />
        </View>
        <Text style={styles.cardDesc}>{quest.description}</Text>
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <GradientBar progress={pct / 100} height={7} delay={120 + Math.min(index, 6) * 60} />
          </View>
          <Text style={[styles.progressText, quest.completed && styles.progressTextDone]}>
            {quest.completed ? t('quests_completed_badge') : `${quest.progress}/${quest.target}`}
          </Text>
        </View>
      </View>
    </View>
  );
  return (
    <Reveal index={Math.min(index, 6)}>
      {quest.completed
        // Quête terminée : cadre fin au dégradé de marque (pas de vert : une
        // seule couleur d'accent dans l'app).
        ? <BrandFrame innerStyle={styles.cardFrameInner}>{body}</BrandFrame>
        : <View style={styles.card}>{body}</View>}
    </Reveal>
  );
}

export default function QuestsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
      <P2Header title={t('quests_title')} emoji="🎯" onBack={() => router.back()} />

      {/* Bilan : anneau des quêtes terminées + XP gagnés qui défilent. */}
      <Reveal style={styles.hero}>
        <ProgressRing size={112} stroke={9} progress={quests.length ? doneCount / quests.length : 0}>
          <Text style={styles.heroRatio}>{doneCount}/{quests.length}</Text>
          <Text style={styles.heroRatioLabel} numberOfLines={1}>{t('quests_completed_stat')}</Text>
        </ProgressRing>
        <View style={styles.heroXp}>
          <Text style={styles.heroXpIcon}>✨</Text>
          <CountUp value={totalXp} style={styles.heroXpValue} />
          <Text style={styles.heroXpLabel}>{t('quests_xp_earned_stat')}</Text>
        </View>
      </Reveal>

      <View style={styles.filters}>
        {(['all', 'active', 'done'] as const).map((f) => (
          <BrandChip
            key={f}
            active={filter === f}
            onPress={() => { haptics.select(); setFilter(f); }}
            label={f === 'all' ? t('quests_filter_all') : f === 'active' ? t('quests_filter_active') : t('quests_filter_done')}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(q) => q.id}
          renderItem={({ item, index }) => <QuestCard quest={item} index={index} />}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 80 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<P2Empty emoji="🏆" text={t('quests_empty')} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    padding: spacing.lg, borderRadius: radius.xl, ...GLASS_SURFACE,
  },
  heroRatio: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  heroRatioLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', maxWidth: 84, textAlign: 'center' },
  heroXp: { flex: 1, gap: 2 },
  heroXpIcon: { fontSize: 22 },
  heroXpValue: { color: colors.brandSoft, fontSize: 34, fontWeight: '900', letterSpacing: -0.8, padding: 0 },
  heroXpLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },

  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, marginBottom: spacing.xs },

  card: { borderRadius: radius.lg, ...GLASS_SURFACE },
  cardFrameInner: { backgroundColor: colors.surface },
  cardInner: { flexDirection: 'row', gap: 14, padding: 14, alignItems: 'center' },
  emoji: { fontSize: 26 },
  cardBody: { flex: 1, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontWeight: '900', color: colors.text, fontSize: 16, flex: 1, letterSpacing: -0.2 },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  progressBar: { flex: 1 },
  progressText: { fontSize: 12, color: colors.textMuted, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  progressTextDone: { color: colors.brandSoft },
});
