import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, PanResponder,
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface Profile {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  level: number;
  totalXp: number;
  distanceKm?: number;
  gender?: string | null;
  birthYear?: number | null;
}

const SWIPE_THRESHOLD = 100;

const FILTERS = [
  { value: 'everyone', label: '🌍 Tous' },
  { value: 'female', label: '👩 Femmes' },
  { value: 'male', label: '👨 Hommes' },
] as const;

type FilterValue = typeof FILTERS[number]['value'];

export default function DiscoverPeopleScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [filter, setFilter] = useState<FilterValue>('everyone');
  const pan = useRef(new Animated.ValueXY()).current;

  const load = useCallback(async (interestedIn: FilterValue = 'everyone') => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let url = `${API}/discover/swipe?limit=15&interestedIn=${interestedIn}`;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        url += `&lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`;
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) { const data = await res.json(); setProfiles(Array.isArray(data) ? data : []); setIdx(0); }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(filter); }, [load, filter]);

  const markSeen = async (userId: string) => {
    await fetch(`${API}/discover/swipe/${userId}/seen`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const current = profiles[idx];
      if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
        Animated.timing(pan, { toValue: { x: gesture.dx > 0 ? 500 : -500, y: gesture.dy }, duration: 200, useNativeDriver: false }).start(() => {
          if (current) void markSeen(current.id);
          pan.setValue({ x: 0, y: 0 });
          setIdx((i) => i + 1);
        });
      } else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    },
  });

  const rotate = pan.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-10deg', '0deg', '10deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1] });
  const passOpacity = pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0] });

  const current = profiles[idx];
  const next = profiles[idx + 1];

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Découvrir des gens</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Gender filter */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {!current ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎉</Text>
          <Text style={styles.emptyTitle}>Tu as vu tout le monde !</Text>
          <Text style={styles.emptyText}>Reviens plus tard pour découvrir de nouveaux profils.</Text>
          <Pressable style={styles.reloadBtn} onPress={() => load(filter)}>
            <Text style={styles.reloadBtnText}>Recharger</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.deck}>
          {/* Next card (static behind) */}
          {next && (
            <View style={[styles.card, styles.cardBehind]}>
              <ProfileCard profile={next} />
            </View>
          )}

          {/* Current card (draggable) */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[styles.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
          >
            {/* Like / Pass badges */}
            <Animated.View style={[styles.badge, styles.badgeLike, { opacity: likeOpacity }]}>
              <Text style={styles.badgeText}>J'aime ❤️</Text>
            </Animated.View>
            <Animated.View style={[styles.badge, styles.badgePass, { opacity: passOpacity }]}>
              <Text style={styles.badgeText}>Passer 👋</Text>
            </Animated.View>
            <ProfileCard profile={current} />
          </Animated.View>
        </View>
      )}

      {/* Buttons */}
      {current && (
        <View style={[styles.buttons, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.passBtn} onPress={() => { void markSeen(current.id); setIdx((i) => i + 1); pan.setValue({ x: 0, y: 0 }); }}>
            <Text style={styles.passIcon}>👋</Text>
          </Pressable>
          <Pressable style={styles.profileBtn} onPress={() => router.push(`/user/${current.id}`)}>
            <Text style={styles.profileBtnText}>Voir profil</Text>
          </Pressable>
          <Pressable style={styles.likeActionBtn} onPress={async () => {
            await fetch(`${API}/social/follow/${current.id}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
            await markSeen(current.id);
            setIdx((i) => i + 1);
            pan.setValue({ x: 0, y: 0 });
          }}>
            <Text style={styles.likeIcon}>❤️</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <View style={cardStyles.container}>
      {profile.photoUrl ? (
        <Image source={{ uri: profile.photoUrl }} style={cardStyles.photo} />
      ) : (
        <View style={[cardStyles.photo, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#fff', fontSize: 64, fontWeight: '700' }}>{profile.displayName[0]}</Text>
        </View>
      )}
      <View style={cardStyles.info}>
        <View style={cardStyles.nameRow}>
          <Text style={cardStyles.name}>{profile.displayName}</Text>
          <Text style={cardStyles.level}>Niv. {profile.level}</Text>
        </View>
        {(profile.gender || profile.birthYear) && (
          <View style={cardStyles.metaRow}>
            {profile.gender && <Text style={cardStyles.meta}>{profile.gender === 'male' ? '👨 Homme' : profile.gender === 'female' ? '👩 Femme' : '🧑 Autre'}</Text>}
            {profile.birthYear && <Text style={cardStyles.meta}>🎂 {new Date().getFullYear() - profile.birthYear} ans</Text>}
          </View>
        )}
        {profile.bio && <Text style={cardStyles.bio} numberOfLines={3}>{profile.bio}</Text>}
        {profile.distanceKm !== undefined && (
          <View style={cardStyles.distRow}>
            <Text style={cardStyles.dist}>📍 {profile.distanceKm < 1 ? `${Math.round(profile.distanceKm * 1000)}m` : `${profile.distanceKm}km`}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  deck: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: 340, height: 500, borderRadius: radius.xl,
    backgroundColor: colors.surface, position: 'absolute',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    overflow: 'hidden',
  },
  cardBehind: { transform: [{ scale: 0.95 }], top: 16 },
  badge: {
    position: 'absolute', top: 40, zIndex: 10, borderWidth: 3,
    borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 8,
  },
  badgeLike: { left: 20, borderColor: '#4ade80', transform: [{ rotate: '-15deg' }] },
  badgePass: { right: 20, borderColor: '#f87171', transform: [{ rotate: '15deg' }] },
  badgeText: { fontWeight: '900', fontSize: 18, color: colors.text },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: 16, paddingHorizontal: spacing.md },
  passBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  passIcon: { fontSize: 26 },
  profileBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  profileBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  likeActionBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5',
    alignItems: 'center', justifyContent: 'center',
  },
  likeIcon: { fontSize: 26 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { ...typography.h2, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  reloadBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 12 },
  reloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.surface, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.brand + '22', borderColor: colors.brand },
  filterText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: colors.brand },
});

const cardStyles = StyleSheet.create({
  container: { flex: 1 },
  photo: { width: '100%', height: 340 },
  info: { padding: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  name: { ...typography.h2, color: colors.text },
  level: { backgroundColor: colors.brand + '22', color: colors.brand, fontWeight: '700', fontSize: 13, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  meta: { fontSize: 13, color: colors.brand, fontWeight: '600' },
  bio: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 8 },
  distRow: { flexDirection: 'row', alignItems: 'center' },
  dist: { fontSize: 13, color: colors.textMuted },
});
