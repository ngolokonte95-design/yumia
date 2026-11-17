/**
 * Éléments visuels de l'écran d'appel (app/call.tsx) — purement graphiques :
 * aucun ne connaît WebRTC, la signalisation ni l'état de l'appel au-delà des
 * booléens qu'on leur passe. Les boucles d'animation s'arrêtent dès que
 * `pulsing` repasse à false et au démontage.
 */
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { gradients, motion } from '../../theme/tokens';

const AVATAR = 132;
const RING = AVATAR + 28;

// ── Avatar et anneaux lumineux ──────────────────────────────────────────────

/** Un anneau au dégradé de marque qui s'élargit et s'efface, en boucle. */
function PulseRing({ pulsing, delay }: { pulsing: boolean; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!pulsing) {
      cancelAnimation(p);
      p.value = withTiming(0, { duration: 250 });
      return;
    }
    p.value = 0;
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }), -1));
    return () => cancelAnimation(p);
  }, [pulsing, delay, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 0.85 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.75 }],
  }));

  return (
    <Animated.View style={[styles.pulseRing, style]} pointerEvents="none">
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pulseRingFill} />
      {/* Évidement : seul le contour du dégradé reste visible. */}
      <View style={styles.pulseRingHole} />
    </Animated.View>
  );
}

export function PulsingAvatar({ photo, initials, pulsing }: { photo?: string; initials: string; pulsing: boolean }) {
  // Respiration douce de l'avatar lui-même pendant la sonnerie.
  const b = useSharedValue(0);
  useEffect(() => {
    if (!pulsing) {
      cancelAnimation(b);
      b.value = withTiming(0, { duration: 250 });
      return;
    }
    b.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(b);
  }, [pulsing, b]);
  const breathe = useAnimatedStyle(() => ({ transform: [{ scale: 1 + b.value * 0.035 }] }));

  return (
    <View style={styles.avatarFrame}>
      <PulseRing pulsing={pulsing} delay={0} />
      <PulseRing pulsing={pulsing} delay={800} />
      <PulseRing pulsing={pulsing} delay={1600} />
      <Animated.View style={breathe}>
        {/* Liseré permanent au dégradé de marque autour de l'avatar. */}
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarHalo}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

// ── Boutons ─────────────────────────────────────────────────────────────────

function useSpringPress() {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return {
    style,
    onPressIn: () => { s.value = withSpring(0.9, motion.spring.snappy); },
    onPressOut: () => { s.value = withSpring(1, motion.spring.snappy); },
  };
}

/** Bouton rond en verre (micro, haut-parleur, caméra, clavier). */
export function GlassControl({ icon, label, active, onPress }: { icon: string; label: string; active: boolean; onPress: () => void }) {
  const press = useSpringPress();
  return (
    <Pressable style={styles.control} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={[styles.controlCircle, active && styles.controlCircleActive, press.style]}>
        <Text style={styles.controlIcon}>{icon}</Text>
      </Animated.View>
      <Text style={styles.controlLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const ACTION_COLORS = {
  accept: '#2BB673',
  decline: '#E5484D',
} as const;

/**
 * Grand bouton rond d'action : décrocher (vert), refuser / raccrocher (rouge).
 * `bounce` : petit rebond régulier qui invite à décrocher.
 */
export function RoundAction({ kind, icon, label, onPress, bounce = false }: {
  kind: keyof typeof ACTION_COLORS;
  icon: string;
  label: string;
  onPress: () => void;
  bounce?: boolean;
}) {
  const press = useSpringPress();
  const j = useSharedValue(0);
  useEffect(() => {
    if (!bounce) {
      cancelAnimation(j);
      j.value = 0;
      return;
    }
    j.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 260, easing: Easing.out(Easing.quad) }),
        withSpring(0, motion.spring.bouncy),
        withTiming(0, { duration: 900 }),
      ),
      -1,
    );
    return () => cancelAnimation(j);
  }, [bounce, j]);
  const jump = useAnimatedStyle(() => ({ transform: [{ translateY: j.value }] }));
  const color = ACTION_COLORS[kind];

  return (
    <Pressable style={styles.action} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={[jump, press.style]}>
        <View style={[styles.actionCircle, { backgroundColor: color, shadowColor: color }]}>
          <Text style={styles.actionIcon}>{icon}</Text>
        </View>
      </Animated.View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarFrame: { width: RING * 1.9, height: RING * 1.9, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  pulseRingFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pulseRingHole: { width: RING - 4, height: RING - 4, borderRadius: (RING - 4) / 2, backgroundColor: '#03030A' },
  avatarHalo: {
    width: AVATAR + 8, height: AVATAR + 8, borderRadius: (AVATAR + 8) / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#E8621A', shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 3, borderColor: '#03030A' },
  avatarFallback: { backgroundColor: '#17171F', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 46, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  control: { alignItems: 'center', gap: 8, minWidth: 66 },
  controlCircle: {
    width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  controlCircleActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.35)' },
  controlIcon: { fontSize: 25 },
  controlLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textAlign: 'center' },

  action: { alignItems: 'center', gap: 10 },
  actionCircle: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  actionIcon: { fontSize: 32 },
  actionLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
});
