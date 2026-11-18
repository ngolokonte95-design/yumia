/**
 * Amis proches / Favoris — deux listes gérées par le même écran (param `type`).
 *  - type=close-friends : GET /social/close-friends, POST/DELETE /social/close-friends/:userId
 *  - type=favorites     : GET /social/favorites,     POST/DELETE /social/favorites/:userId
 * L'ajout se fait depuis la liste des personnes que je suis (following).
 *
 * Habillage sobre (18/11/2026) : lignes en verre, « Ajouter » en pastille
 * blanche, « Retirer » en rouge fonctionnel discret, aucun autre accent.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import type { Plan } from '../lib/feed-api';
import { useI18n } from '../lib/useI18n';
import {
  PersonRow, PillButton, QuietCount, QuietEmpty, QuietHeader, SPINNER_COLOR,
} from '../components/pb2/Pb2Chrome';

const API = API_BASE_URL;

interface SimpleUser {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  plan?: Plan | null;
}

export default function CloseFriendsScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { t } = useI18n();
  const isFavorites = type === 'favorites';

  const basePath = isFavorites ? 'favorites' : 'close-friends';
  const title = isFavorites ? t('cf_title_favorites') : t('cf_title_close_friends');
  const emptyIcon = isFavorites ? '⭐' : '🟢';
  const emptyText = isFavorites
    ? t('cf_empty_text_favorites')
    : t('cf_empty_text_close_friends');

  const [members, setMembers] = useState<SimpleUser[]>([]);
  const [following, setFollowing] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const load = useCallback(async () => {
    if (!accessToken || !user) return;
    try {
      const [listRes, followingRes] = await Promise.all([
        fetch(`${API}/social/${basePath}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/social/users/${user.id}/following`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (listRes.ok) setMembers(await listRes.json() as SimpleUser[]);
      if (followingRes.ok) setFollowing(await followingRes.json() as SimpleUser[]);
    } catch {
      // réseau — listes vides, retour possible
    }
    setLoading(false);
  }, [accessToken, user, basePath]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (target: SimpleUser) => {
    if (!accessToken) return;
    const isMember = memberIds.has(target.id);
    setProcessingId(target.id);
    try {
      const res = await fetch(`${API}/social/${basePath}/${target.id}`, {
        method: isMember ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setMembers((prev) => (isMember ? prev.filter((m) => m.id !== target.id) : [...prev, target]));
      }
    } catch {
      // best-effort
    }
    setProcessingId(null);
  };

  // Membres en tête, puis le reste des abonnements (candidats à l'ajout).
  const rows = useMemo(() => {
    const others = following.filter((f) => !memberIds.has(f.id));
    return [...members, ...others];
  }, [members, following, memberIds]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={title} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={SPINNER_COLOR} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }}
          ListHeaderComponent={
            members.length > 0 ? (
              <QuietCount label={`${members.length} ${members.length > 1 ? t('cf_people_plural') : t('cf_people_singular')}`} />
            ) : undefined
          }
          ListEmptyComponent={
            <QuietEmpty emoji={emptyIcon} title={t('cf_empty_title')} text={emptyText} />
          }
          renderItem={({ item, index }) => {
            const isMember = memberIds.has(item.id);
            return (
              <PersonRow
                index={index}
                uri={item.photoUrl}
                name={item.displayName}
                plan={item.plan}
                sub={item.bio}
                onPress={() => router.push(`/user/${item.id}` as never)}
                action={(
                  <PillButton
                    tone={isMember ? 'danger' : 'solid'}
                    label={isMember ? t('cf_remove') : t('cf_add')}
                    loading={processingId === item.id}
                    onPress={() => void toggle(item)}
                  />
                )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
