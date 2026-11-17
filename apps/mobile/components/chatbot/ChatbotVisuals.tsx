/**
 * Briques visuelles de l'assistant IA (17/11/2026) : orbe animé de l'en-tête,
 * petit orbe des réponses, bulles, indicateur « réfléchit… ». Purement
 * visuelles — aucune ne touche à l'envoi, au quota ou au consentement.
 * Une seule couleur d'accent, le dégradé de marque.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { colors, elevation, gradients, radius } from '../../theme/tokens';

export const BOT_BG = '#07070B';
const GLASS = 'rgba(31,31,42,0.82)';
const HAIRLINE = 'rgba(255,255,255,0.10)';

/** Vrai tant que l'écran est affiché (les boucles s'arrêtent sinon). */
function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return focused;
}

/** Sphère au dégradé de marque avec reflet. */
function Sphere({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <LinearGradient colors={gradients.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View
        style={{
          position: 'absolute', left: size * 0.18, top: size * 0.12,
          width: size * 0.42, height: size * 0.3, borderRadius: size,
          backgroundColor: 'rgba(255,255,255,0.35)',
        }}
      />
      <View style={[StyleSheet.absoluteFill, styles.sphereCenter]}>
        <Text style={{ fontSize: size * 0.42 }}>✨</Text>
      </View>
    </View>
  );
}

/** Anneau qui s'élargit et s'efface, en boucle. */
function PulseRing({ size, delay, active }: { size: number; delay: number; active: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1));
    return () => cancelAnimation(p);
  }, [active, delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.75 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colors.brandSoft }, style]}
    />
  );
}

/** Orbe de l'en-tête : sphère de marque + deux anneaux qui pulsent (arrêtés hors focus). */
export function AiOrb({ size = 42 }: { size?: number }) {
  const focused = useScreenFocused();
  return (
    <View style={[styles.orbBox, { width: size * 1.6, height: size * 1.6 }]}>
      <PulseRing size={size} delay={0} active={focused} />
      <PulseRing size={size} delay={1200} active={focused} />
      <View style={elevation.glowBrand}>
        <Sphere size={size} />
      </View>
    </View>
  );
}

/** Petit orbe à côté des réponses de l'assistant. */
export function BotAvatar() {
  return <Sphere size={26} />;
}

/**
 * Bulle de message. `animate` : seul le dernier message, ajouté pendant la
 * conversation, glisse à son arrivée — l'historique s'affiche d'un bloc.
 */
export function Bubble({ role, content, animate }: { role: 'user' | 'assistant'; content: string; animate: boolean }) {
  const mine = role === 'user';
  return (
    <Animated.View
      entering={animate ? FadeInDown.duration(260) : undefined}
      style={[styles.row, mine ? styles.rowMine : styles.rowBot]}
    >
      {!mine ? <BotAvatar /> : null}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleBot]}>
        {mine ? (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        ) : null}
        <Text style={[styles.text, mine && styles.textMine]}>{content}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 260 }),
    ), -1));
    return () => cancelAnimation(v);
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + v.value * 0.65,
    transform: [{ translateY: -4 * v.value }],
  }));
  return (
    <Animated.View style={[styles.dot, style]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** « L'assistant réfléchit… » : trois points au dégradé qui sautillent. */
export function TypingBubble() {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.row, styles.rowBot]}>
      <BotAvatar />
      <View style={[styles.bubble, styles.bubbleBot, styles.typing]}>
        <Dot delay={0} />
        <Dot delay={140} />
        <Dot delay={280} />
      </View>
    </Animated.View>
  );
}

export const chatbotGlass = { backgroundColor: GLASS, borderColor: HAIRLINE };

const styles = StyleSheet.create({
  sphereCenter: { alignItems: 'center', justifyContent: 'center' },
  orbBox: { alignItems: 'center', justifyContent: 'center' },

  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
  rowMine: { justifyContent: 'flex-end' },
  rowBot: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingVertical: 11, paddingHorizontal: 14, overflow: 'hidden' },
  // Coin « queue » du côté de l'expéditeur, dans le sens de lecture.
  bubbleMine: { borderBottomEndRadius: 6 },
  bubbleBot: {
    borderBottomStartRadius: 6, backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE,
  },
  text: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  textMine: { color: '#fff', fontWeight: '500' },

  typing: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 15 },
  dot: { width: 8, height: 8, borderRadius: 4, overflow: 'hidden' },
});
