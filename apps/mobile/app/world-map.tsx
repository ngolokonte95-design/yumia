import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, elevation, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { startSharingLocation, stopSharingLocation } from '../lib/share-location';
import type { Plan } from '../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../components/Avatar';
import { useI18n } from '../lib/useI18n';
import { FeatureTip } from '../components/FeatureTip';
import { BrandButton } from '../components/social/SocialChrome';
import { PB_BACK, PbButton, PbCircle } from '../components/pb1/PbChrome';

const API = API_BASE_URL;

/**
 * Plafond de marqueurs affichés. Chaque marqueur est une vue React (Avatar)
 * rendue en bitmap par react-native-maps, qui fuit de la mémoire sur iOS :
 * au-delà de quelques dizaines, l'app finit tuée par le système (même
 * raison que la limite de 80 lieux de l'onglet Carte). On garde les plus
 * proches de l'utilisateur (ou du centre par défaut).
 *
 * Habillage du 18/11/2026 : la carte occupe tout l'écran, l'en-tête et le
 * panneau de visibilité flottent dessus en verre sombre. Les repères gardent
 * EXACTEMENT leur structure (une vue + un Avatar) et leur nombre.
 */
const MAX_MARKERS = 60;

interface WorldUser {
  userId: string;
  lat: number;
  lng: number;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  plan?: Plan | null;
}

export default function WorldMapScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [users, setUsers] = useState<WorldUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

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

  /** Fonction d'arrêt rendue par `startSharingLocation`, tant qu'on diffuse. */
  const stopWatchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void getLocation();
    void loadUsers();
  }, [getLocation, loadUsers]);

  // Quitter l'écran arrête la diffusion : une souscription laissée ouverte
  // continuerait de consommer la batterie sans que rien ne l'affiche.
  // La position déjà envoyée reste visible 10 minutes côté serveur (TTL Redis),
  // puis s'efface d'elle-même.
  useEffect(() => () => stopWatchRef.current?.(), []);

  const toggleBroadcast = async () => {
    if (!accessToken) return;
    if (broadcasting) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      await stopSharingLocation(accessToken);
      setBroadcasting(false);
    } else {
      const coords = await getLocation();
      if (!coords) {
        setPermissionDenied(true);
        return;
      }
      // Premier envoi immédiat : la surveillance ne rendra une position que
      // 30 s (ou 50 m) plus tard.
      await fetch(`${API}/location/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude, visibility: 'map' }),
      });
      const stop = await startSharingLocation(accessToken);
      if (!stop) {
        setPermissionDenied(true);
        return;
      }
      stopWatchRef.current = stop;
      setPermissionDenied(false);
      setBroadcasting(true);
      void loadUsers();
    }
  };

  const shownUsers = useMemo(() => {
    if (users.length <= MAX_MARKERS) return users;
    const c = myLoc ?? { lat: 48.8566, lng: 2.3522 };
    const d2 = (u: WorldUser) => {
      const dLat = u.lat - c.lat;
      const dLng = (u.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180);
      return dLat * dLat + dLng * dLng;
    };
    return [...users].sort((a, b) => d2(a) - d2(b)).slice(0, MAX_MARKERS);
  }, [users, myLoc]);

  const initialRegion = myLoc
    ? { latitude: myLoc.lat, longitude: myLoc.lng, latitudeDelta: 60, longitudeDelta: 60 }
    : { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 60, longitudeDelta: 60 };

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.textPrimary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        userInterfaceStyle="light"
        // La carte passe sous l'en-tête et le panneau flottants : cette marge
        // garde le logo Google / la mention Apple visibles au-dessus du
        // panneau (exigé par leurs conditions d'utilisation).
        mapPadding={{ top: insets.top + 56, right: 0, bottom: insets.bottom + 150, left: 0 }}
      >
        {shownUsers.map((u) => (
          <Marker key={u.userId} coordinate={{ latitude: u.lat, longitude: u.lng }}>
            <View style={styles.markerContainer}>
              <Avatar
                uri={u.photoUrl}
                size={38}
                placeholderColor={colors.brand}
                fallback={<Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{u.displayName[0]}</Text>}
              />
            </View>
            <Callout onPress={() => router.push(`/user/${u.userId}`)}>
              <View style={styles.callout}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.calloutName}>{u.displayName}</Text>
                  <PlanBadgeIcon plan={u.plan} size={18} />
                </View>
                {u.bio && <Text style={styles.calloutBio} numberOfLines={2}>{u.bio}</Text>}
                <Text style={styles.calloutAction}>{t('wm_see_profile')}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* En-tête flottant, en verre sombre. `box-none` : la carte reste
          manipulable entre les éléments. */}
      <View style={[styles.header, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <PbCircle label={PB_BACK} onPress={() => router.back()} style={styles.headerGlass} />
        <View style={[styles.titlePill, styles.headerGlass]}>
          <Text style={styles.title} numberOfLines={1}>{t('wm_title')}</Text>
          <View style={styles.titleDot} />
          <Text style={styles.count} numberOfLines={1}>{t('wm_online_count').replace('{n}', String(users.length))}</Text>
        </View>
      </View>

      {/* Broadcast toggle */}
      <View style={[styles.broadcastBar, { bottom: insets.bottom + 20 }]}>
        <View style={styles.broadcastInfo}>
          <Text style={styles.broadcastTitle}>
            {broadcasting ? t('wm_visible') : t('wm_invisible')}
          </Text>
          {/* Qui me verra : rappelé ici, modifiable en un geste. */}
          <Pressable onPress={() => router.push('/edit-social-profile' as never)} hitSlop={6}>
            <Text style={styles.audienceLink}>
              {t('wm_visible_to').replace(
                '{who}',
                t(user?.mapAudience === 'everyone' ? 'esp_audience_everyone' : 'esp_audience_friends'),
              )}
              {' · '}<Text style={styles.audienceChange}>{t('wm_change')}</Text>
            </Text>
          </Pressable>
          <Text style={styles.broadcastSub}>
            {permissionDenied
              ? t('wm_perm_denied')
              : broadcasting
                ? t('wm_broadcasting_hint')
                : t('wm_activate_hint')}
          </Text>
        </View>
        {broadcasting ? (
          // Désactiver : neutre, texte rouge fonctionnel.
          <PbButton onPress={toggleBroadcast} variant="glass" compact>
            <Text style={styles.deactivateText} numberOfLines={1}>{t('wm_deactivate')}</Text>
          </PbButton>
        ) : (
          // M'afficher : l'action principale, seul bouton au dégradé de marque.
          <BrandButton label={t('wm_show_me')} onPress={toggleBroadcast} compact />
        )}
      </View>
      <FeatureTip feature="world_map" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  map: { flex: 1 },

  header: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  // Sur une carte claire, le verre doit être presque opaque pour rester lisible.
  headerGlass: {
    backgroundColor: 'rgba(14,14,18,0.9)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
    ...elevation.medium,
  },
  titlePill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1,
    height: 42, paddingHorizontal: spacing.md, borderRadius: radius.pill,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: -0.2, flexShrink: 1 },
  titleDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted },
  count: { fontSize: 13, color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'] },

  markerContainer: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: colors.brand,
    overflow: 'hidden', backgroundColor: colors.surface,
  },
  callout: { padding: 12, minWidth: 160, maxWidth: 220 },
  calloutName: { fontWeight: '800', fontSize: 15, marginBottom: 4, color: '#111' },
  calloutBio: { fontSize: 13, color: '#555', marginBottom: 6 },
  calloutAction: { color: '#111', fontWeight: '800', fontSize: 13 },

  broadcastBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    backgroundColor: 'rgba(14,14,18,0.94)', borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
    gap: 12,
    ...elevation.medium,
  },
  broadcastInfo: { flex: 1 },
  broadcastTitle: { fontWeight: '900', color: colors.text, fontSize: 15, marginBottom: 2, letterSpacing: -0.2 },
  broadcastSub: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  audienceLink: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  audienceChange: { color: colors.textPrimary, fontWeight: '800', textDecorationLine: 'underline' },
  deactivateText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
});
