import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface UserProfile {
  id: string; displayName: string; photoUrl?: string; bio?: string;
  totalXp: number; level: number; followersCount: number;
  followingCount: number; visitCount: number; isFollowedByMe: boolean;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    const res = await fetch(`${API}/social/users/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) {
      const data = await res.json() as UserProfile;
      setProfile(data);
      setFollowing(data.isFollowedByMe);
    }
    setLoading(false);
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  const toggleFollow = async () => {
    if (!accessToken || !id) return;
    const method = following ? 'DELETE' : 'POST';
    await fetch(`${API}/social/follow/${id}`, { method, headers: { Authorization: `Bearer ${accessToken}` } });
    setFollowing(!following);
    setProfile((p) => p ? { ...p, followersCount: p.followersCount + (following ? -1 : 1) } : p);
  };

  const openChat = async () => {
    if (!accessToken || !id) return;
    const res = await fetch(`${API}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId: id }),
    });
    if (res.ok) {
      const { id: convId } = await res.json() as { id: string };
      router.push(`/chat/${convId}`);
    }
  };

  if (loading) return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} /></View>;
  if (!profile) return <View style={[styles.center, { paddingTop: insets.top }]}><Text style={{ color: colors.textMuted }}>Utilisateur introuvable</Text></View>;

  const isMe = me?.id === id;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View>
            {/* Avatar + infos */}
            <View style={styles.profileTop}>
              {profile.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{profile.displayName[0]}</Text>
                </View>
              )}
              <Text style={styles.name}>{profile.displayName}</Text>
              {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{profile.visitCount}</Text>
                  <Text style={styles.statLabel}>Visites</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{profile.followersCount}</Text>
                  <Text style={styles.statLabel}>Abonnés</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{profile.followingCount}</Text>
                  <Text style={styles.statLabel}>Abonnements</Text>
                </View>
              </View>

              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>✨ Niveau {profile.level} · {profile.totalXp} XP</Text>
              </View>

              {/* Actions */}
              {!isMe && (
                <View style={styles.actions}>
                  <Pressable style={[styles.followBtn, following && styles.followBtnActive]} onPress={toggleFollow}>
                    <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                      {following ? 'Abonné ✓' : 'Suivre'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.chatBtn} onPress={openChat}>
                    <Text style={styles.chatBtnText}>💬 Message</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  profileTop: { alignItems: 'center', padding: spacing.lg },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 12 },
  name: { ...typography.h2, color: colors.text, marginBottom: 6 },
  bio: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: spacing.lg },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  stat: { alignItems: 'center', paddingHorizontal: 20 },
  statVal: { ...typography.h2, color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
  levelBadge: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 20 },
  levelText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12 },
  followBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center',
  },
  followBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followBtnTextActive: { color: colors.text },
  chatBtn: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  chatBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
