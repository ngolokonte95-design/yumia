import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface WorldUser {
  userId: string;
  lat: number;
  lng: number;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
}

export default function WorldMapScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<WorldUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastVis, setBroadcastVis] = useState<'map' | 'off'>('off');

  const loadUsers = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/discover/world-map`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) setUsers(await res.json());
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const getLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMyLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    return loc.coords;
  }, []);

  useEffect(() => {
    void getLocation();
    void loadUsers();
  }, [getLocation, loadUsers]);

  const toggleBroadcast = async () => {
    if (broadcasting) {
      await fetch(`${API}/location/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ visibility: 'off', lat: 0, lng: 0 }),
      });
      setBroadcasting(false);
      setBroadcastVis('off');
    } else {
      const coords = await getLocation();
      if (!coords) return;
      await fetch(`${API}/location/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude, visibility: 'map' }),
      });
      setBroadcasting(true);
      setBroadcastVis('map');
      void loadUsers();
    }
  };

  const initialRegion = myLoc
    ? { latitude: myLoc.lat, longitude: myLoc.lng, latitudeDelta: 60, longitudeDelta: 60 }
    : { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 60, longitudeDelta: 60 };

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Carte Mondiale</Text>
        <Text style={styles.count}>{users.length} en ligne</Text>
      </View>

      <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation>
        {users.map((u) => (
          <Marker key={u.userId} coordinate={{ latitude: u.lat, longitude: u.lng }}>
            <View style={styles.markerContainer}>
              {u.photoUrl ? (
                <Image source={{ uri: u.photoUrl }} style={styles.markerAvatar} />
              ) : (
                <View style={[styles.markerAvatar, { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{u.displayName[0]}</Text>
                </View>
              )}
            </View>
            <Callout onPress={() => router.push(`/user/${u.userId}`)}>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{u.displayName}</Text>
                {u.bio && <Text style={styles.calloutBio} numberOfLines={2}>{u.bio}</Text>}
                <Text style={styles.calloutAction}>Voir le profil →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Broadcast toggle */}
      <View style={[styles.broadcastBar, { bottom: insets.bottom + 20 }]}>
        <View style={styles.broadcastInfo}>
          <Text style={styles.broadcastTitle}>
            {broadcasting ? '🟢 Visible sur la carte' : '⚫ Invisible'}
          </Text>
          <Text style={styles.broadcastSub}>
            {broadcasting ? 'Les autres utilisateurs te voient' : 'Active pour apparaître sur la carte mondiale'}
          </Text>
        </View>
        <Pressable style={[styles.broadcastBtn, broadcasting && styles.broadcastBtnActive]} onPress={toggleBroadcast}>
          <Text style={styles.broadcastBtnText}>{broadcasting ? 'Désactiver' : 'M\'afficher'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 12, zIndex: 10,
  },
  back: { fontSize: 22, color: colors.brand, marginRight: spacing.sm },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  count: { fontSize: 13, color: colors.textMuted },
  map: { flex: 1 },
  markerContainer: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: colors.brand,
    overflow: 'hidden', backgroundColor: colors.surface,
  },
  markerAvatar: { width: 38, height: 38, borderRadius: 19 },
  callout: { padding: 12, minWidth: 160, maxWidth: 220 },
  calloutName: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
  calloutBio: { fontSize: 13, color: '#666', marginBottom: 6 },
  calloutAction: { color: '#007AFF', fontWeight: '700', fontSize: 13 },
  broadcastBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    gap: 12,
  },
  broadcastInfo: { flex: 1 },
  broadcastTitle: { fontWeight: '700', color: colors.text, fontSize: 14, marginBottom: 2 },
  broadcastSub: { fontSize: 12, color: colors.textMuted },
  broadcastBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 10 },
  broadcastBtnActive: { backgroundColor: '#ef4444' },
  broadcastBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
