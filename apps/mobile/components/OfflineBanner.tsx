import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/tokens';
import { useNetworkStatus } from '../lib/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const { top } = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showBanner = !isOnline || (wasOffline && isOnline);
  const isReconnected = wasOffline && isOnline;

  useEffect(() => {
    if (showBanner) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }

    if (isReconnected) {
      // Auto-hide "Reconnecté" banner after 2.5 s
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: -80, duration: 300, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [showBanner, isReconnected, translateY, opacity]);

  if (!showBanner) return null;

  const bgColor = isReconnected ? colors.success : '#D32F2F';
  const icon = isReconnected ? '✓' : '✕';
  const label = isReconnected ? 'Connexion rétablie' : 'Pas de connexion internet';

  return (
    <Animated.View
      style={[
        styles.container,
        { top: top + 8, opacity, transform: [{ translateY }] },
        { backgroundColor: bgColor },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  icon: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
});
