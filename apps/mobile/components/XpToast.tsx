/**
 * XpToast — popup animée qui apparaît brièvement après une visite réussie.
 * Affiche les XP gagnés, le nouveau niveau si level-up, et les badges gagnés.
 * S'auto-masque après 3 secondes.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VisitResult } from '../lib/passport-api';
import { haptics } from '../lib/useHaptics';
import { useStoreReview } from '../lib/useStoreReview';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface XpToastProps {
  result: VisitResult | null;
  onDone: () => void;
}

export function XpToast({ result, onDone }: XpToastProps) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const { onVisitRecorded } = useStoreReview();

  useEffect(() => {
    if (!result) return;

    // Retour haptique : heavy si badge/level-up, sinon success
    if (result.newBadges.length > 0) {
      haptics.heavy();
    } else {
      haptics.success();
    }

    void onVisitRecorded();

    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onDone());
  }, [result, anim, onDone, onVisitRecorded]);

  if (!result) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
  const opacity = anim;

  const hasLevelUp = false; // Derived in parent if needed
  const hasBadges = result.newBadges.length > 0;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + spacing.sm, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.xp}>+{result.xpAwarded} XP</Text>
      {hasBadges ? (
        <Text style={styles.badge}>
          🏆 {result.newBadges[0]}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  xp: { ...typography.heading, color: '#fff' },
  badge: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
});
