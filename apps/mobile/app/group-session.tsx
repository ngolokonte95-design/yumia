/**
 * GROUP SESSION — salle de vote collaborative.
 * Statuts : waiting (en attente) → voting (vote en cours) → done (lieu choisi).
 * Polling toutes les 3 s pour synchroniser l'état entre les membres.
 *
 * Habillage du 18/11/2026 : sobre (verre sombre, blanc). Le dégradé de marque
 * n'apparaît que sur le cadre du code d'invitation et sur le bouton principal
 * de l'étape en cours. Le vert et le rouge des votes restent : ils ont un sens.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { useI18n } from '../lib/useI18n';
import { ratingSuffix } from '../lib/place-rating';
import { PressableScale, Reveal } from '../components/ui';
import { BrandButton } from '../components/social/SocialChrome';
import { BrandFrame } from '../components/profile/ProfileChrome';
import { PB_GLASS, PbButton, PbHeader, PbLabel, PbPill } from '../components/pb1/PbChrome';

const POLL_INTERVAL = 3000;

export default function GroupSessionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const { coords } = useLocation();
  const { t } = useI18n();

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
      setError(err instanceof Error ? err.message : t('gs_load_error'));
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
      message: t('gs_share_message').replace(/\{code\}/g, session.inviteCode),
      title: t('gs_share_title'),
    });
  }

  async function handleSuggest() {
    if (!accessToken || !session) return;
    setSuggesting(true);
    try {
      const data = await suggestGroupPlaces(accessToken, session.id, coords.lat, coords.lng, 'fr');
      setSession(data);
    } catch (err) {
      Alert.alert(t('gs_error'), err instanceof Error ? err.message : t('gs_search_failed'));
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
      Alert.alert(t('gs_error'), err instanceof Error ? err.message : t('gs_vote_failed'));
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
      Alert.alert(t('gs_error'), err instanceof Error ? err.message : t('gs_decide_failed'));
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
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  if (error || !session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? t('gs_session_not_found')}</Text>
        <PbButton label={t('gs_back')} onPress={() => router.back()} variant="glass" compact />
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
      <PbHeader
        title={t('gs_title')}
        onBack={() => router.back()}
        style={{ paddingTop: insets.top + spacing.sm }}
        right={(
          <PbPill
            // Point de statut : vert quand le groupe a choisi, blanc sinon.
            dot={session.status === 'done' ? colors.success : 'rgba(255,255,255,0.7)'}
            label={session.status === 'waiting' ? t('gs_status_waiting') :
              session.status === 'voting' ? t('gs_status_voting') : t('gs_status_done')}
            style={styles.statusPill}
          />
        )}
      />

      {/* Code d'invitation — le cadre au dégradé de marque de l'écran. */}
      <Reveal index={0} style={styles.codeWrap}>
        <PressableScale onPress={handleShare} scaleTo={0.98} haptic>
          <BrandFrame innerStyle={styles.codeCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeLabel}>{t('gs_invite_code')}</Text>
              <Text style={styles.codeValue} numberOfLines={1} adjustsFontSizeToFit>{session.inviteCode}</Text>
            </View>
            <View style={[styles.shareBtn, PB_GLASS]}>
              <Text style={styles.shareBtnText} numberOfLines={1}>{t('gs_share')}</Text>
            </View>
          </BrandFrame>
        </PressableScale>
      </Reveal>

      {/* Membres */}
      <Reveal index={1} style={styles.section}>
        <PbLabel label={t('gs_members_count').replace('{n}', String(session.members.length))} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersRow}>
          {session.members.map((m) => (
            <View key={m.id} style={styles.memberItem}>
              {m.photoUrl
                ? <Image source={{ uri: m.photoUrl }} style={styles.memberAvatar} />
                : (
                  <View style={[styles.memberAvatarPlaceholder, PB_GLASS]}>
                    <Text style={styles.memberInitial}>
                      {(m.displayName ?? 'I').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              <Text style={styles.memberName} numberOfLines={1}>
                {m.displayName ?? t('gs_guest')}
              </Text>
              {session.status === 'voting' && (
                <Text style={styles.memberVotedCount}>
                  {m.votedCount}/{session.suggestions.length} ✓
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      </Reveal>

      {/* État WAITING : bouton lancer recherche (hôte seulement) */}
      {session.status === 'waiting' && (
        <Reveal index={2} style={styles.section}>
          {isHost ? (
            <>
              <Text style={styles.infoText}>
                {t('gs_host_ready_prompt')}
              </Text>
              <BrandButton label={t('gs_launch_search')} onPress={handleSuggest} loading={suggesting} />
            </>
          ) : (
            <View style={[styles.waitBox, PB_GLASS]}>
              <ActivityIndicator color={colors.textPrimary} />
              <Text style={[styles.infoText, styles.waitText]}>{t('gs_waiting_for_host')}</Text>
            </View>
          )}
        </Reveal>
      )}

      {/* État VOTING : cartes de vote */}
      {session.status === 'voting' && session.suggestions.length > 0 && (
        <View style={styles.section}>
          <PbLabel label={t('gs_vote_each')} />
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
        <Reveal index={2} style={styles.section}>
          <PbLabel label={t('gs_group_chose')} />
          <View style={[styles.winnerCard, PB_GLASS]}>
            {winner.photoUrl && (
              <Image source={{ uri: winner.photoUrl }} style={styles.winnerPhoto} />
            )}
            <View style={styles.winnerInfo}>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerMeta}>{winner.city}{ratingSuffix(winner.rating)}</Text>
              <View style={styles.winnerVotes}>
                <Text style={styles.winnerVoteStat}>👍 {winner.likes}</Text>
                <Text style={[styles.winnerVoteStat, { color: colors.danger }]}>👎 {winner.dislikes}</Text>
              </View>
            </View>
            <BrandButton label={t('gs_go_there')} onPress={() => handleGoToPlace(winner)} style={styles.goBtn} />
          </View>
        </Reveal>
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
  const { t } = useI18n();
  const likeLoading = votingId === s.placeId + 'like';
  const dislikeLoading = votingId === s.placeId + 'dislike';

  return (
    <View style={[styles.voteCard, PB_GLASS]}>
      {s.photoUrl && (
        <Image source={{ uri: s.photoUrl }} style={styles.voteCardPhoto} />
      )}
      <View style={styles.voteCardBody}>
        <Text style={styles.voteCardName}>{s.name}</Text>
        <Text style={styles.voteCardMeta}>
          {s.city}{ratingSuffix(s.rating)}
        </Text>
        <View style={styles.voteRow}>
          <PressableScale
            style={[styles.voteBtn, PB_GLASS, s.myVote === 'like' && styles.voteBtnActive, likeLoading && styles.btnDisabled]}
            onPress={() => onVote(s.placeId, 'like')}
            disabled={!!votingId}
            scaleTo={0.94}
          >
            {likeLoading
              ? <ActivityIndicator size="small" color={colors.success} />
              : <Text style={styles.voteBtnText}>👍 {s.likes}</Text>
            }
          </PressableScale>
          <PressableScale
            style={[styles.voteBtn, PB_GLASS, s.myVote === 'dislike' && styles.voteBtnDanger, dislikeLoading && styles.btnDisabled]}
            onPress={() => onVote(s.placeId, 'dislike')}
            disabled={!!votingId}
            scaleTo={0.94}
          >
            {dislikeLoading
              ? <ActivityIndicator size="small" color={colors.danger} />
              : <Text style={styles.voteBtnText}>👎 {s.dislikes}</Text>
            }
          </PressableScale>
          {isHost && (
            <PbButton label={t('gs_choose')} onPress={() => onDecide(s.placeId)} compact style={styles.decideBtn} />
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
  statusPill: { alignSelf: 'center', maxWidth: 150 },

  codeWrap: { paddingHorizontal: spacing.md, marginTop: spacing.xs },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  codeLabel: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, textTransform: 'uppercase',
  },
  codeValue: {
    color: colors.textPrimary, fontSize: 34, fontWeight: '900', letterSpacing: 8, marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  shareBtn: { borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 40, alignItems: 'center', justifyContent: 'center', maxWidth: 140 },
  shareBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },

  section: { paddingHorizontal: spacing.md, marginTop: spacing.xl },

  membersRow: { gap: spacing.md, paddingEnd: spacing.sm },
  memberItem: { alignItems: 'center', gap: 5, width: 62 },
  memberAvatar: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  memberAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { color: colors.textPrimary, fontSize: 19, fontWeight: '900' },
  memberName: { ...typography.label, color: colors.textPrimary, fontSize: 11, textAlign: 'center' },
  memberVotedCount: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  infoText: { ...typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.md },
  waitBox: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, borderRadius: radius.lg, gap: spacing.md },
  waitText: { marginBottom: 0, textAlign: 'center' },

  voteCard: {
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  voteCardPhoto: { width: '100%', height: 190 },
  voteCardBody: { padding: spacing.md, gap: 4 },
  voteCardName: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  voteCardMeta: { ...typography.caption, color: colors.textSecondary },
  voteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  voteBtn: {
    flex: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  voteBtnActive: { backgroundColor: `${colors.success}22`, borderColor: colors.success, borderWidth: 1.5 },
  voteBtnDanger: { backgroundColor: `${colors.danger}22`, borderColor: colors.danger, borderWidth: 1.5 },
  voteBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  decideBtn: { height: 44 },

  winnerCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  winnerPhoto: { width: '100%', height: 240 },
  winnerInfo: { padding: spacing.md, gap: spacing.sm },
  winnerName: { color: colors.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  winnerMeta: { ...typography.caption, color: colors.textSecondary },
  winnerVotes: { flexDirection: 'row', gap: spacing.lg },
  winnerVoteStat: { ...typography.body, color: colors.success, fontWeight: '700' },
  goBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  btnDisabled: { opacity: 0.5 },
});
