import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Circle, Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';
const BROADCAST_INTERVAL = 30_000; // 30s

interface NearbyUser {
  userId: string;
  lat: number;
  lng: number;
  distanceKm: number;
  user: { id: string; displayName: string; photoUrl?: string; bio?: string; level: number } | null;
}

export default function NearbyUsersScreen() {
  const { accessToken } = useAuth();
  const { location } = useLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [nearby, setNearby] = useState<NearbyUser[]>([]);
  const [broadcasting, setBroadcasting] = useState(false);
  const [loading, setLoading] = useState(false);
  const broadcastRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNearby = useCallback(async () => {
    if (!accessToken || !location) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/location/nearby?lat=${location.coords.latitude}&lng=${location.coords.longitude}&radius=5`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) setNearby(await res.json());
    } finally {
      setLoading(false);
    }
  }, [accessToken, location]);

  const broadcast = useCallback(async () => {
    if (!accessToken || !location) return;
    await fetch(`${API}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ lat: location.coords.latitude, lng: location.coords.longitude, visibility: 'everyone' }),
    });
  }, [accessToken, location]);

  const toggleBroadcast = useCallback(async () => {
    if (broadcasting) {
      if (broadcastRef.current) clearInterval(broadcastRef.current);
      broadcastRef.current = null;
      await fetch(`${API}/location/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
      setBroadcasting(false);
    } else {
      await broadcast();
      broadcastRef.current = setInterval(() => { void broadcast(); }, BROADCAST_INTERVAL);
      setBroadcasting(true);
      void fetchNearby();
    }
  }, [broadcasting, broadcast, fetchNearby, accessToken]);

  useEffect(() => { void fetchNearby(); }, [fetchNearby]);
  useEffect(() => () => { if (broadcastRef.current) clearInterval(broadcastRef.current); }, []);

  if (!location) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.loadingText}>Localisation en cours...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Nearby 📍</Text>
        <Pressable onPress={() => router.push('/world-map')} style={styles.worldBtn}>
          <Text style={styles.worldBtnText}>🌍 Monde</Text>
        </Pressable>
      </View>

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Ma position */}
        <Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}>
          <View style={styles.myMarker}>
            <Text style={{ fontSize: 20 }}>😎</Text>
          </View>
        </Marker>

        {/* Rayon 5km */}
        <Circle
          center={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
          radius={5000}
          strokeColor={colors.brand + '44'}
          fillColor={colors.brand + '11'}
        />

        {/* Utilisateurs proches */}
        {nearby.map((u) => (
          <Marker key={u.userId} coordinate={{ latitude: u.lat, longitude: u.lng }}>
            <View style={styles.userMarker}>
              <Text style={{ fontSize: 18 }}>{u.user?.photoUrl ? '👤' : '🙂'}</Text>
            </View>
            <Callout onPress={() => router.push(`/user/${u.userId}`)}>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{u.user?.displayName ?? 'Utilisateur'}</Text>
                <Text style={styles.calloutDist}>À {u.distanceKm} km · Niveau {u.user?.level ?? 1}</Text>
                {u.user?.bio && <Text style={styles.calloutBio}>{u.user.bio}</Text>}
                <Text style={styles.calloutAction}>Voir le profil →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Bottom card */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.bottomTitle}>
          {broadcasting ? '🟢 Ta position est visible' : '⚫ Position masquée'}
        </Text>
        <Text style={styles.bottomSub}>
          {broadcasting
            ? 'Les autres utilisateurs peuvent te voir dans un rayon de 5 km.'
            : 'Active ta position pour être visible et rencontrer des gens proches.'}
        </Text>
        <View style={styles.bottomActions}>
          <Pressable style={[styles.broadcastBtn, broadcasting && styles.broadcastBtnActive]} onPress={toggleBroadcast}>
            <Text style={styles.broadcastBtnText}>
              {broadcasting ? 'Masquer ma position' : 'Partager ma position'}
            </Text>
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={fetchNearby}>
            {loading ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={styles.refreshBtnText}>↻</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textMuted, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  count: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  worldBtn: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  worldBtnText: { color: colors.brand, fontWeight: '700', fontSize: 12 },
  map: { flex: 1 },
  myMarker: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  userMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.brand,
  },
  callout: { padding: 8, minWidth: 160 },
  calloutName: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  calloutDist: { fontSize: 12, color: '#666', marginBottom: 4 },
  calloutBio: { fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 4 },
  calloutAction: { fontSize: 13, color: colors.brand, fontWeight: '700' },
  bottomCard: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  bottomTitle: { fontWeight: '700', fontSize: 16, color: colors.text, marginBottom: 4 },
  bottomSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
  bottomActions: { flexDirection: 'row', gap: 10 },
  broadcastBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.lg,
    padding: 12, alignItems: 'center',
  },
  broadcastBtnActive: { backgroundColor: colors.danger },
  broadcastBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  refreshBtn: {
    width: 46, height: 46, borderRadius: radius.lg,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtnText: { fontSize: 22, color: colors.brand },
});
