/**
 * En-tête de la fiche lieu : galerie de photos plein écran qu'on fait glisser,
 * qui se décale en parallaxe au défilement et s'étire quand on tire la fiche
 * vers le bas. Sans photo : le dégradé de l'univers et son icône qui flotte.
 *
 * Placé DANS le contenu défilant (pas derrière) : il garde ainsi les gestes
 * (glisser entre les photos, toucher pour agrandir).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, motion, radius, spacing } from '../../theme/tokens';
import { universeGradient } from '../../lib/universeTheme';
import { UniverseGlyph } from '../UniverseGlyph';
import { PressableScale } from '../ui';

/** Nombre maximal de points de pagination affichés (au-delà, compteur). */
const MAX_DOTS = 8;

export function PlaceHero({
  photos, universe, width, height, topInset, scrollY, focused, isSaved, credit,
  onOpenPhoto, onBack, onShare, onToggleSave,
}: {
  photos: string[];
  universe: string;
  width: number;
  height: number;
  topInset: number;
  scrollY: SharedValue<number>;
  focused: boolean;
  isSaved: boolean;
  /** Crédit de la photo (CGU Google Maps), posé en bas à gauche. */
  credit?: ReactNode;
  onOpenPhoto: (index: number) => void;
  onBack: () => void;
  onShare: () => void;
  onToggleSave?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const grad = universeGradient(universe);

  // Parallaxe au défilement + étirement quand on tire vers le bas (iOS).
  const mediaStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-height, 0, height], [-height / 2, 0, height * 0.45], Extrapolation.EXTEND) },
      { scale: interpolate(scrollY.value, [-height, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));
  // Les boutons et les points s'effacent à mesure que la fiche monte.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, height * 0.5], [1, 0], Extrapolation.CLAMP),
  }));

  // Sans photo : l'icône de l'univers flotte (arrêtée hors de l'écran).
  const float = useSharedValue(0);
  useEffect(() => {
    if (photos.length > 0 || !focused) {
      cancelAnimation(float);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(
      withSequence(withTiming(-10, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })),
      -1,
    );
    return () => cancelAnimation(float);
  }, [photos.length, focused, float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  // Cœur : petit rebond à chaque bascule.
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const toggleSave = () => {
    heart.value = withSequence(withSpring(1.35, motion.spring.bouncy), withSpring(1, motion.spring.snappy));
    onToggleSave?.();
  };

  return (
    <View style={{ height, width }}>
      <Animated.View style={[StyleSheet.absoluteFill, mediaStyle]}>
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {photos.map((uri, i) => (
              <Pressable key={`${uri}-${i}`} onPress={() => onOpenPhoto(i)}>
                <Image
                  source={{ uri }}
                  style={{ width, height }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={uri}
                  transition={200}
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.empty]}>
            <Animated.View style={[styles.emptyIcon, floatStyle]}>
              <UniverseGlyph u={universe} size={84} />
            </Animated.View>
          </LinearGradient>
        )}
        {/* Voiles : haut (lisibilité des boutons) et bas (fondu vers la fiche). */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.45)', 'transparent']}
          style={[styles.scrimTop, { height: topInset + 90 }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(14,14,18,0.55)', colors.bg]}
          locations={[0.55, 0.85, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.topBar, { top: topInset + spacing.sm }, overlayStyle]} pointerEvents="box-none">
        <PressableScale style={styles.glassBtn} onPress={onBack} hitSlop={6}>
          <Text style={styles.glassBtnText}>{I18nManager.isRTL ? '→' : '←'}</Text>
        </PressableScale>
        <View style={styles.topRight}>
          <PressableScale style={styles.glassBtn} onPress={onShare} hitSlop={6}>
            <Text style={styles.glassBtnEmoji}>📤</Text>
          </PressableScale>
          {onToggleSave ? (
            <PressableScale style={styles.glassBtn} onPress={toggleSave} hitSlop={6}>
              <Animated.Text style={[styles.glassBtnEmoji, heartStyle]}>{isSaved ? '❤️' : '🤍'}</Animated.Text>
            </PressableScale>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottomBar, overlayStyle]} pointerEvents="box-none">
        <View style={styles.creditSlot} pointerEvents="box-none">{credit}</View>
        {photos.length > 1 ? (
          photos.length <= MAX_DOTS ? (
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          ) : (
            <View style={styles.counter} pointerEvents="none">
              <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
            </View>
          )
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyIcon: {
    width: 150, height: 150, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.30)', borderWidth: 1,
  },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topRight: { flexDirection: 'row', gap: spacing.sm },
  glassBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1,
  },
  glassBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: -2 },
  glassBtnEmoji: { fontSize: 18 },
  // Au-dessus du bord arrondi de la fiche, qui recouvre le bas de la photo.
  bottomBar: {
    position: 'absolute', left: spacing.md, right: spacing.md, bottom: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  creditSlot: { maxWidth: '55%' },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { width: 18, backgroundColor: '#fff' },
  counter: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
