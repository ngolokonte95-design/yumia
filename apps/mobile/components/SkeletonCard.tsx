/**
 * SkeletonCard — placeholder animé (shimmer) pour SuggestionCard.
 * Montré pendant le chargement du Top 3 et du feed.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';

function Bone({ style }: { style?: object }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[{ backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, opacity: anim }, style]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Bone style={styles.avatar} />
        <View style={styles.lines}>
          <Bone style={styles.lineTitle} />
          <Bone style={styles.lineSub} />
        </View>
      </View>
      <Bone style={styles.lineBody} />
      <View style={styles.actions}>
        <Bone style={styles.actionBtn} />
        <Bone style={styles.actionBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: radius.md },
  lines: { flex: 1, gap: spacing.sm },
  lineTitle: { height: 16, width: '65%' },
  lineSub: { height: 12, width: '45%' },
  lineBody: { height: 14, width: '90%' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1, height: 36, borderRadius: radius.pill },
});
