/**
 * SWIPE — Mode découverte : cartes à swiper pour affiner les préférences IA.
 * Swipe droite = j'aime / Swipe gauche = pas pour moi.
 * Les préférences sont enregistrées côté API pour nourrir le moteur de reco.
 */
import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSE_META } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { useNearbyUniverse } from '../lib/useNearbyUniverse';
import { placeStore } from '../lib/place-store';
import { placeEmoji } from '../lib/universeMeta';
import { apiBase } from '../lib/api';
import type { NearbyPlace } from '../lib/places-api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.35;
const ROTATION_RANGE = 15; // degrés max de rotation

// Enregistre une préférence swipe côté API
async function recordSwipe(token: string | null, placeId: string, liked: boolean) {
  if (!token) return;
  try {
    await fetch(`${apiBase}/swipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ placeId, liked }),
    });
  } catch {
    // fire-and-forget
  }
}

interface SwipeCardProps {
  place: NearbyPlace;
  onLike: () => void;
  onDislike: () => void;
  onTap: () => void;
  isTop: boolean;
}

function SwipeCard({ place, onLike, onDislike, onTap, isTop }: SwipeCardProps) {
  const position = useRef(new Animated.ValueXY()).current;
  const meta = UNIVERSE_META[place.universe as keyof typeof UNIVERSE_META];

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: [`-${ROTATION_RANGE}deg`, '0deg', `${ROTATION_RANGE}deg`],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_W * 0.15],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_W * 0.15, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: (_, gs) => isTop && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5),
      onPanResponderMove: (_, gs) => {
        position.setValue({ x: gs.dx, y: gs.dy });
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.timing(position, {
            toValue: { x: SCREEN_W * 1.5, y: gs.dy },
            duration: 200,
            useNativeDriver: true,
          }).start(onLike);
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Animated.timing(position, {
            toValue: { x: -SCREEN_W * 1.5, y: gs.dy },
            duration: 200,
            useNativeDriver: true,
          }).start(onDislike);
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 5,
          }).start();
        }
      },
    }),
  ).current;

  const cardStyle = isTop
    ? { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }
    : { transform: [{ scale: 0.95 }], opacity: 0.8 };

  return (
    <Animated.View style={[styles.card, cardStyle]} {...(isTop ? panResponder.panHandlers : {})}>
      <Pressable style={{ flex: 1 }} onPress={isTop ? onTap : undefined}>
        {/* Photo */}
        {place.photoUrls && place.photoUrls.length > 0 ? (
          <Image
            source={{ uri: place.photoUrls[0] }}
            style={styles.cardPhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.cardPhotoFallback}>
            <Text style={styles.cardPhotoEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
          </View>
        )}

        {/* Badges LIKE / NOPE */}
        {isTop ? (
          <>
            <Animated.View style={[styles.badge, styles.badgeLike, { opacity: likeOpacity }]}>
              <Text style={styles.badgeText}>J'AIME ❤️</Text>
            </Animated.View>
            <Animated.View style={[styles.badge, styles.badgeNope, { opacity: nopeOpacity }]}>
              <Text style={styles.badgeText}>PASSER 👎</Text>
            </Animated.View>
          </>
        ) : null}

        {/* Infos */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.cardMeta}>
            {meta?.emoji ?? '📍'} {meta?.labelFr ?? place.universe} · ⭐ {place.rating.toFixed(1)} · {'€'.repeat(place.priceTier)}
          </Text>
          {place.city ? <Text style={styles.cardCity}>{place.city}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function SwipeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { coords, resolving } = useLocation();
  const [index, setIndex] = useState(0);

  const { places, loading } = useNearbyUniverse({
    lat: coords.lat,
    lng: coords.lng,
    universe: null,
    radius: 5000,
    limit: 40,
    enabled: !resolving,
  });

  const handleLike = useCallback((place: NearbyPlace) => {
    void recordSwipe(accessToken, place.id, true);
    setIndex((i) => i + 1);
  }, [accessToken]);

  const handleDislike = useCallback((place: NearbyPlace) => {
    void recordSwipe(accessToken, place.id, false);
    setIndex((i) => i + 1);
  }, [accessToken]);

  const handleTap = useCallback((place: NearbyPlace) => {
    placeStore.set({
      place: {
        id: place.id,
        name: place.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        universe: place.universe as any,
        location: { lat: place.lat, lng: place.lng },
        city: place.city,
        countryCode: place.countryCode,
        rating: place.rating,
        priceTier: Math.min(4, Math.max(1, place.priceTier)) as 1|2|3|4,
        photoUrls: place.photoUrls,
        tags: place.tags,
        openingHours: place.openingHours,
      },
      compatibility: 0,
      distanceMeters: place.distanceMeters,
      reason: `Découvert en mode Swipe.`,
      engine: 'mood' as const,
    });
    router.push('/place');
  }, [router]);

  const visible = places.slice(index, index + 2);
  const done = index >= places.length && !loading;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Découverte</Text>
        <Text style={styles.counter}>{Math.max(0, places.length - index)} restants</Text>
      </View>

      {/* Stack de cartes */}
      <View style={styles.stack}>
        {loading && places.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.stateText}>Chargement des lieux…</Text>
          </View>
        ) : done ? (
          <View style={styles.center}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>C'est tout !</Text>
            <Text style={styles.doneBody}>Tu as exploré tous les lieux autour de toi.</Text>
            <Pressable style={styles.retryBtn} onPress={() => setIndex(0)}>
              <Text style={styles.retryText}>Recommencer</Text>
            </Pressable>
          </View>
        ) : (
          // Affiche la 2e carte en dessous, puis la 1re dessus
          [...visible].reverse().map((place, i) => {
            const isTop = i === visible.length - 1;
            return (
              <SwipeCard
                key={place.id}
                place={place}
                isTop={isTop}
                onLike={() => handleLike(place)}
                onDislike={() => handleDislike(place)}
                onTap={() => handleTap(place)}
              />
            );
          })
        )}
      </View>

      {/* Boutons manuels */}
      {!done && places.length > 0 ? (
        <View style={[styles.buttons, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            style={[styles.actionBtn, styles.dislikeBtn]}
            onPress={() => { if (visible[0]) handleDislike(visible[0]); }}
          >
            <Text style={styles.actionIcon}>👎</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.infoBtn]}
            onPress={() => { if (visible[0]) handleTap(visible[0]); }}
          >
            <Text style={styles.actionIcon}>ℹ️</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.likeBtn]}
            onPress={() => { if (visible[0]) handleLike(visible[0]); }}
          >
            <Text style={styles.actionIcon}>❤️</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const CARD_H = SCREEN_H * 0.62;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.title, color: colors.textPrimary, flex: 1 },
  counter: { ...typography.caption, color: colors.textMuted },

  stack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },

  card: {
    position: 'absolute',
    width: SCREEN_W - spacing.lg * 2,
    height: CARD_H,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardPhoto: { width: '100%', height: '70%' },
  cardPhotoFallback: {
    width: '100%',
    height: '70%',
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoEmoji: { fontSize: 72 },
  cardInfo: { padding: spacing.md, gap: 4 },
  cardName: { ...typography.title, color: colors.textPrimary },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  cardCity: { ...typography.label, color: colors.textMuted },

  badge: {
    position: 'absolute',
    top: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 3,
  },
  badgeLike: {
    left: spacing.md,
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.15)',
    transform: [{ rotate: '-15deg' }],
  },
  badgeNope: {
    right: spacing.md,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.15)',
    transform: [{ rotate: '15deg' }],
  },
  badgeText: { ...typography.label, color: colors.textPrimary, fontWeight: '800' },

  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  dislikeBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: '#ef4444' },
  infoBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brand },
  likeBtn: { backgroundColor: colors.surface, borderWidth: 2, borderColor: '#22c55e' },
  actionIcon: { fontSize: 26 },

  center: { alignItems: 'center', gap: spacing.md },
  stateText: { ...typography.body, color: colors.textSecondary },
  doneEmoji: { fontSize: 64 },
  doneTitle: { ...typography.heading, color: colors.textPrimary },
  doneBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  retryText: { ...typography.caption, color: '#fff', fontWeight: '700' },
});
