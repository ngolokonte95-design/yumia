/**
 * Astuce flottante de première utilisation : une carte qui explique l'écran
 * la première fois qu'on y arrive, puis ne revient plus (voir feature-tips).
 *
 * À poser en DERNIER enfant de la vue racine de l'écran : elle se dessine
 * par-dessus, en position absolue. Pas de Modal : iOS refuse en silence d'en
 * présenter une pendant une transition d'écran, et l'astuce restait alors
 * « affichée » sans jamais apparaître — en bloquant toutes les suivantes.
 *
 * N'apparaît que si l'écran est au premier plan, une demi-seconde après
 * l'arrivée ; quitter l'écran la retire sans la marquer comme vue.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const anim = useRef(new Animated.Value(0)).current;
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
        // Écran quitté : l'astuce s'efface sans être comptée comme vue, et
        // libère sa place pour celle de l'écran suivant.
        setVisible(false);
        releaseTipSlot(feature);
      };
    }, [feature, status]),
  );

  useEffect(() => () => releaseTipSlot(feature), [feature]);

  useEffect(() => {
    if (!visible) { anim.setValue(0); return; }
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [visible, anim]);

  const dismiss = () => {
    void markTipSeen(feature);
    setVisible(false);
    releaseTipSlot(feature);
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel={t('tip_got_it')} />
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          { bottom: Math.max(insets.bottom, spacing.md) + spacing.md },
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.emoji}>{tip.emoji}</Text>
          <Text style={styles.title}>{t(tip.title)}</Text>
        </View>
        <Text style={styles.body}>{t(tip.body)}</Text>
        <Pressable style={styles.btn} onPress={dismiss} accessibilityRole="button">
          <Text style={styles.btnTxt}>{t('tip_got_it')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
  card: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brand,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
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
