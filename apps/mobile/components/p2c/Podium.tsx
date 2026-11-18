/**
 * Podium animé du classement : 2e à gauche, 1er au centre, 3e à droite.
 * Les socles montent d'un ressort, décalés ; médaillons à anneau de marque.
 * L'or, l'argent et le bronze ne passent que par les médailles (discrètes) :
 * la couleur d'accent reste le dégradé de marque.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import type { LeaderboardEntry } from '../../lib/passport-api';
import { colors, gradients, motion, radius, spacing } from '../../theme/tokens';
import { GradientText, Reveal } from '../ui';
import { CountUp, GradientRing } from '../profile/ProfileChrome';
import { GLASS_SURFACE } from './P2Visuals';

const SLOTS = [
  { place: 2, height: 92, avatar: 62, delay: 120, medal: '🥈' },
  { place: 1, height: 124, avatar: 78, delay: 0, medal: '🥇' },
  { place: 3, height: 72, avatar: 62, delay: 240, medal: '🥉' },
] as const;

function Plinth({ height, delay, place }: { height: number; delay: number; place: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(350 + delay, withSpring(height, motion.spring.gentle));
  }, [h, height, delay]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Animated.View style={[styles.plinth, style]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.plinthEdge} />
      <GradientText style={[styles.plinthRank, place === 1 && styles.plinthRankFirst]}>{String(place)}</GradientText>
    </Animated.View>
  );
}

export function Podium({
  entries, myUserId, anonymousLabel, youSuffix, xpLabel,
}: {
  /** Les trois premiers (moins s'il y a moins de joueurs). */
  entries: LeaderboardEntry[];
  myUserId?: string;
  anonymousLabel: string;
  youSuffix: string;
  xpLabel: string;
}) {
  const byPlace = new Map(entries.map((e) => [e.rank, e] as const));
  return (
    <View style={styles.row}>
      {SLOTS.map((slot) => {
        const e = byPlace.get(slot.place);
        if (!e) return <View key={slot.place} style={styles.slot} />;
        const isMe = e.userId === myUserId;
        const name = e.displayName ?? anonymousLabel;
        return (
          <View key={slot.place} style={styles.slot}>
            <Reveal index={slot.place} from="fade" style={styles.person}>
              {slot.place === 1 ? <Text style={styles.crown}>👑</Text> : null}
              <View>
                <GradientRing size={slot.avatar} thickness={isMe ? 4 : 3}>
                  <Text style={[styles.initial, { fontSize: slot.avatar * 0.38 }]}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                </GradientRing>
                <Text style={styles.medal}>{slot.medal}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>{name}{isMe ? youSuffix : ''}</Text>
              <View style={styles.xpRow}>
                <CountUp value={e.weeklyXp} style={styles.xp} />
                <Text style={styles.xpLabel}>{xpLabel}</Text>
              </View>
            </Reveal>
            <Plinth height={slot.height} delay={slot.delay} place={slot.place} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  slot: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  person: { alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  crown: { fontSize: 22, marginBottom: -2 },
  initial: { color: colors.textPrimary, fontWeight: '900' },
  medal: { position: 'absolute', bottom: -6, alignSelf: 'center', fontSize: 20 },
  name: { color: colors.textPrimary, fontSize: 13, fontWeight: '800', marginTop: 6, maxWidth: '100%' },
  xpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  xp: { color: colors.brandSoft, fontSize: 15, fontWeight: '900', padding: 0 },
  xpLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  plinth: {
    borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, overflow: 'hidden',
    alignItems: 'center', paddingTop: spacing.sm, ...GLASS_SURFACE,
  },
  plinthEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  plinthRank: { fontSize: 30, fontWeight: '900' },
  plinthRankFirst: { fontSize: 40 },
});
