/**
 * Astuce flottante de première utilisation : une carte qui explique l'écran
 * la première fois qu'on y arrive, puis ne revient plus (voir feature-tips).
 *
 * Posée n'importe où dans l'écran : elle s'affiche dans une Modal, donc sans
 * dépendre de la mise en page. N'apparaît que si l'écran est au premier plan,
 * une demi-seconde après l'arrivée — le temps de voir où l'on est.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { useAuth } from '../lib/auth-context';
import {
  FEATURE_TIPS, claimTipSlot, hasSeenTip, markTipSeen, releaseTipSlot, type FeatureTipId,
} from '../lib/feature-tips';

const SHOW_DELAY_MS = 500;

export function FeatureTip({ feature }: { feature: FeatureTipId }) {
  const { t } = useI18n();
  const { status } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;
  const tip = FEATURE_TIPS[feature];

  useFocusEffect(
    useCallback(() => {
      if (status !== 'authenticated') return;
      let cancelled = false;
      const timer = setTimeout(() => {
        void hasSeenTip(feature).then((seen) => {
          if (cancelled || seen || !claimTipSlot(feature)) return;
          setVisible(true);
        });
      }, SHOW_DELAY_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [feature, status]),
  );

  useEffect(() => {
    if (!visible) return;
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [visible, slide]);

  const dismiss = () => {
    void markTipSeen(feature);
    setVisible(false);
    releaseTipSlot(feature);
    slide.setValue(0);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Animated.View
          style={[
            styles.card,
            { marginBottom: insets.bottom + 90 },
            {
              opacity: slide,
              transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            },
          ]}
        >
          {/* Toucher la carte ne la ferme pas : seul le bouton, ou le fond. */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.emoji}>{tip.emoji}</Text>
              <Text style={styles.title}>{t(tip.title)}</Text>
            </View>
            <Text style={styles.body}>{t(tip.body)}</Text>
            <Pressable style={styles.btn} onPress={dismiss} accessibilityRole="button">
              <Text style={styles.btnTxt}>{t('tip_got_it')}</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brand,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  emoji: { fontSize: 26 },
  title: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  btn: {
    alignSelf: 'flex-end', marginTop: spacing.md, backgroundColor: colors.brand,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10,
  },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
