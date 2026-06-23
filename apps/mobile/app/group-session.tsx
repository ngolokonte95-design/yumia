/**
 * GROUP SESSION — salle de vote collaborative.
 * Statuts : waiting (en attente) → voting (vote en cours) → done (lieu choisi).
 * Polling toutes les 3 s pour synchroniser l'état entre les membres.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { placeStore } from '../lib/place-store';
import {
  getGroupSession,
  suggestGroupPlaces,
  voteGroupPlace,
  decideGroupPlace,
  type GroupSession,
  type GroupSuggestion,
} from '../lib/groups-api';

const POLL_INTERVAL = 3000;

export default function GroupSessionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { coords } = useLocation();

  const [session, setSession] = useState<GroupSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSession = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const data = await getGroupSession(accessToken, id);
      setSession(data);
      setError(null);
      if (data.status === 'done') stopPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    fetchSession();
    pollRef.current = setInterval(fetchSession, POLL_INTERVAL);
    return stopPolling;
  }, [fetchSession]);

  async function handleShare() {
    if (!session) return;
    await Share.share({
      message: `Rejoins ma session YUMIA ! Code : ${session.inviteCode}\nyumia://join?code=${session.inviteCode}`,
      title: 'YUMIA — Rejoins ma session',
    });
  }

  async function handleSuggest() {
    if (!accessToken || !session) return;
    setSuggesting(true);
    try {
      const data = await suggestGroupPlaces(accessToken, session.id, coords.lat, coords.lng, 'fr');
      setSession(data);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de lancer la recherche.');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleVote(placeId: string, vote: 'like' | 'dislike') {
    if (!accessToken || !session) return;
    setVotingId(placeId + vote);
    try {
      const data = await voteGroupPlace(accessToken, session.id, placeId, vote);
      setSession(data);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Vote impossible.');
    } finally {
      setVotingId(null);
    }
  }

  async function handleDecide(placeId: string) {
    if (!accessToken || !session) return;
    try {
      const data = await decideGroupPlace(accessToken, session.id, placeId);
      setSession(data);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Impossible de désigner ce lieu.');
    }
  }

  function handleGoToPlace(suggestion: GroupSuggestion) {
    placeStore.set({
      place: {
        id: suggestion.placeId,
        name: suggestion.name,
        universe: suggestion.universe as any,
        city: suggestion.city,
        countryCode: '',
        rating: suggestion.rating,
        priceTier: suggestion.priceTier as 1 | 2 | 3 | 4,
        photoUrls: suggestion.photoUrl ? [suggestion.photoUrl] : [],
        tags: [],
        location: { lat: 0, lng: 0 },
      },
      compatibility: suggestion.score,
      distanceMeters: 0,
      reason: '',
      engine: 'mood' as const,
    });
    router.push('/place');
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (error || !session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? 'Session introuvable.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtnSmall}>
          <Text style={styles.backBtnSmallText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  const isHost = session.createdById === user?.id;
  const winner = session.decidedPlaceId
    ? session.suggestions.find((s) => s.placeId === session.decidedPlaceId)
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>👥 Session groupe</Text>
          <Text style={styles.statusBadge}>
            {session.status === 'waiting' ? '⏳ En attente...' :
             session.status === 'voting' ? '🗳 Vote en cours' : '✅ Lieu choisi !'}
          </Text>
        </View>
      </View>

      {/* Code d'invitation */}
      <Pressable style={styles.codeCard} onPress={handleShare}>
        <View>
          <Text style={styles.codeLabel}>Code d'invitation</Text>
          <Text style={styles.codeValue}>{session.inviteCode}</Text>
        </View>
        <Text style={styles.shareBtn}>Partager →</Text>
      </Pressable>

      {/* Membres */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Membres ({session.members.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersRow}>
          {session.members.map((m) => (
            <View key={m.id} style={styles.memberItem}>
              {m.photoUrl
                ? <Image source={{ uri: m.photoUrl }} style={styles.memberAvatar} />
                : (
                  <View style={styles.memberAvatarPlaceholder}>
                    <Text style={styles.memberInitial}>
                      {(m.displayName ?? 'I').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              <Text style={styles.memberName} numberOfLines={1}>
                {m.displayName ?? 'Invité'}
              </Text>
              {session.status === 'voting' && (
                <Text style={styles.memberVotedCount}>
                  {m.votedCount}/{session.suggestions.length} ✓
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* État WAITING : bouton lancer recherche (hôte seulement) */}
      {session.status === 'waiting' && (
        <View style={styles.section}>
          {isHost ? (
            <>
              <Text style={styles.infoText}>
                Tous les membres sont prêts ? Lance la recherche pour obtenir 3 suggestions.
              </Text>
              <Pressable
                style={[styles.launchBtn, suggesting && styles.btnDisabled]}
                onPress={handleSuggest}
                disabled={suggesting}
              >
                {suggesting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.launchBtnText}>🤖 Lancer la recherche</Text>
                }
              </Pressable>
            </>
          ) : (
            <View style={styles.waitBox}>
              <Text style={styles.infoText}>En attente que l'hôte lance la recherche...</Text>
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
            </View>
          )}
        </View>
      )}

      {/* État VOTING : cartes de vote */}
      {session.status === 'voting' && session.suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Votez pour chaque lieu</Text>
          {session.suggestions.map((s) => (
            <SuggestionVoteCard
              key={s.placeId}
              suggestion={s}
              votingId={votingId}
              isHost={isHost}
              onVote={handleVote}
              onDecide={handleDecide}
            />
          ))}
        </View>
      )}

      {/* État DONE : gagnant */}
      {session.status === 'done' && winner && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎉 Le groupe a choisi !</Text>
          <View style={styles.winnerCard}>
            {winner.photoUrl && (
              <Image source={{ uri: winner.photoUrl }} style={styles.winnerPhoto} />
            )}
            <View style={styles.winnerInfo}>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerMeta}>{winner.city} · {'★'.repeat(Math.round(winner.rating))} · {'€'.repeat(winner.priceTier)}</Text>
              <View style={styles.winnerVotes}>
                <Text style={styles.winnerVoteStat}>👍 {winner.likes}</Text>
                <Text style={[styles.winnerVoteStat, { color: colors.danger }]}>👎 {winner.dislikes}</Text>
              </View>
            </View>
            <Pressable style={styles.goBtn} onPress={() => handleGoToPlace(winner)}>
              <Text style={styles.goBtnText}>Y aller →</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function SuggestionVoteCard({
  suggestion: s,
  votingId,
  isHost,
  onVote,
  onDecide,
}: {
  suggestion: GroupSuggestion;
  votingId: string | null;
  isHost: boolean;
  onVote: (id: string, v: 'like' | 'dislike') => void;
  onDecide: (id: string) => void;
}) {
  const likeLoading = votingId === s.placeId + 'like';
  const dislikeLoading = votingId === s.placeId + 'dislike';

  return (
    <View style={styles.voteCard}>
      {s.photoUrl && (
        <Image source={{ uri: s.photoUrl }} style={styles.voteCardPhoto} />
      )}
      <View style={styles.voteCardBody}>
        <Text style={styles.voteCardName}>{s.name}</Text>
        <Text style={styles.voteCardMeta}>
          {s.city} · {'★'.repeat(Math.round(s.rating))} · {'€'.repeat(s.priceTier)}
        </Text>
        <View style={styles.voteRow}>
          <Pressable
            style={[styles.voteBtn, s.myVote === 'like' && styles.voteBtnActive, likeLoading && styles.btnDisabled]}
            onPress={() => onVote(s.placeId, 'like')}
            disabled={!!votingId}
          >
            {likeLoading
              ? <ActivityIndicator size="small" color={colors.success} />
              : <Text style={styles.voteBtnText}>👍 {s.likes}</Text>
            }
          </Pressable>
          <Pressable
            style={[styles.voteBtn, s.myVote === 'dislike' && styles.voteBtnDanger, dislikeLoading && styles.btnDisabled]}
            onPress={() => onVote(s.placeId, 'dislike')}
            disabled={!!votingId}
          >
            {dislikeLoading
              ? <ActivityIndicator size="small" color={colors.danger} />
              : <Text style={styles.voteBtnText}>👎 {s.dislikes}</Text>
            }
          </Pressable>
          {isHost && (
            <Pressable style={styles.decideBtn} onPress={() => onDecide(s.placeId)}>
              <Text style={styles.decideBtnText}>Choisir →</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { paddingTop: 4 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.heading, color: colors.textPrimary },
  statusBadge: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: spacing.md,
    backgroundColor: `${colors.brand}12`,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  codeLabel: { ...typography.caption, color: colors.textSecondary },
  codeValue: { ...typography.title, color: colors.brand, letterSpacing: 6, marginTop: 2 },
  shareBtn: { ...typography.caption, color: colors.brand, fontWeight: '700' },

  section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.md },

  membersRow: { gap: spacing.md, paddingRight: spacing.sm },
  memberItem: { alignItems: 'center', gap: 4, width: 56 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { ...typography.heading, color: colors.brand, fontSize: 18 },
  memberName: { ...typography.label, color: colors.textPrimary, fontSize: 10, textAlign: 'center' },
  memberVotedCount: { ...typography.label, color: colors.textMuted, fontSize: 9 },

  infoText: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  waitBox: { alignItems: 'center', paddingVertical: spacing.xl },
  launchBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  launchBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },

  voteCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  voteCardPhoto: { width: '100%', height: 140 },
  voteCardBody: { padding: spacing.md, gap: spacing.sm },
  voteCardName: { ...typography.heading, color: colors.textPrimary },
  voteCardMeta: { ...typography.caption, color: colors.textMuted },
  voteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  voteBtn: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  voteBtnActive: { backgroundColor: `${colors.success}18`, borderColor: colors.success },
  voteBtnDanger: { backgroundColor: `${colors.danger}18`, borderColor: colors.danger },
  voteBtnText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  decideBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  decideBtnText: { ...typography.caption, color: '#fff', fontWeight: '700' },

  winnerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.success,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  winnerPhoto: { width: '100%', height: 180 },
  winnerInfo: { padding: spacing.md, gap: spacing.sm },
  winnerName: { ...typography.heading, color: colors.textPrimary, fontSize: 20 },
  winnerMeta: { ...typography.caption, color: colors.textMuted },
  winnerVotes: { flexDirection: 'row', gap: spacing.lg },
  winnerVoteStat: { ...typography.body, color: colors.success, fontWeight: '700' },
  goBtn: {
    backgroundColor: colors.brand,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  goBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },

  backBtnSmall: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  backBtnSmallText: { ...typography.body, color: colors.textSecondary },
  btnDisabled: { opacity: 0.5 },
});
