import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/tokens';
import { onQuotaNotice } from '../lib/quota-notice';

/** Durée d'affichage d'un avertissement. */
const VISIBLE_MS = 4500;

/**
 * Bandeau « plus que N chargements aujourd'hui · Gold : 40 par jour ».
 *
 * Monté une fois à la racine (app/_layout.tsx) : il s'affiche par-dessus
 * l'écran qui vient de décompter, se retire seul, et un appui ouvre la page
 * des forfaits. Voir lib/quota-notice.ts pour la diffusion.
 */
export function QuotaNoticeBanner() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const hide = () => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => setMessage(null));
    };
    const off = onQuotaNotice((text) => {
      setMessage(text);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, VISIBLE_MS);
    });
    return () => {
      off();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [translateY, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, { top: top + 8, opacity, transform: [{ translateY }] }]}>
      <Pressable
        style={styles.inner}
        onPress={() => { setMessage(null); router.push('/plus' as never); }}
        accessibilityRole="button"
      >
        <Text style={styles.icon}>👑</Text>
        <Text style={styles.label}>{message}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 998,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.brand,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: { fontSize: 16 },
  label: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  chevron: { color: colors.brand, fontSize: 20, fontWeight: '700' },
});
