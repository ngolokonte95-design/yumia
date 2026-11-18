/**
 * Abonnés / abonnements d'un utilisateur, avec recherche par nom.
 * Habillage sobre (18/11/2026) : recherche en pilule vitrée, lignes en verre,
 * « Suivre » en pastille blanche, « Suivi » en verre — aucun accent de couleur.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { socialApi } from '../../lib/social-api';
import { colors, spacing } from '../../theme/tokens';
import type { Plan } from '../../lib/feed-api';
import { useI18n } from '../../lib/useI18n';
import { SearchPill } from '../../components/p2a/P2Chrome';
import {
  PersonRow, PillButton, QuietEmpty, QuietHeader, SPINNER_COLOR,
} from '../../components/pb2/Pb2Chrome';


type FollowUser = {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  level: number;
  plan?: Plan | null;
};

export default function FollowListScreen() {
  const { userId, type } = useLocalSearchParams<{ userId: string; type: 'followers' | 'following' }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [filtered, setFiltered] = useState<FollowUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const isFollowers = type === 'followers';
  const title = isFollowers ? t('fl_followers') : t('fl_following');

  const load = useCallback(async () => {
    if (!accessToken || !userId) return;
    const list = isFollowers
      ? await socialApi.getFollowers(accessToken, userId)
      : await socialApi.getFollowing(accessToken, userId);
    setUsers(list);
    setFiltered(list);

    // check qui on suit parmi la liste
    const myFollowing = await socialApi.getFollowing(accessToken, me?.id ?? '');
    setFollowing(new Set(myFollowing.map((u) => u.id)));
    setLoading(false);
  }, [accessToken, userId, isFollowers, me?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(users); return; }
    const q = search.toLowerCase();
    setFiltered(users.filter((u) => u.displayName.toLowerCase().includes(q)));
  }, [search, users]);

  const toggleFollow = async (targetId: string) => {
    if (!accessToken) return;
    if (following.has(targetId)) {
      await socialApi.unfollow(accessToken, targetId);
      setFollowing((prev) => { const s = new Set(prev); s.delete(targetId); return s; });
    } else {
      await socialApi.follow(accessToken, targetId);
      setFollowing((prev) => new Set([...prev, targetId]));
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={title} onBack={() => router.back()} />

      <SearchPill
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder={t('fl_search_placeholder')}
        onClear={() => setSearch('')}
        autoCorrect={false}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={SPINNER_COLOR} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={<QuietEmpty emoji="🔎" text={t('fl_no_results')} />}
          renderItem={({ item, index }) => {
            const isMe = item.id === me?.id;
            const isFollowed = following.has(item.id);
            return (
              <PersonRow
                index={index}
                uri={item.photoUrl}
                name={item.displayName}
                plan={item.plan}
                sub={item.bio ? item.bio : t('fl_level').replace('{n}', String(item.level))}
                onPress={() => router.push(`/user/${item.id}` as never)}
                action={!isMe ? (
                  <PillButton
                    tone={isFollowed ? 'glass' : 'solid'}
                    label={isFollowed ? t('fl_followed') : t('fl_follow')}
                    onPress={() => void toggleFollow(item.id)}
                  />
                ) : undefined}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  search: { marginHorizontal: spacing.md, marginBottom: spacing.md },
});
