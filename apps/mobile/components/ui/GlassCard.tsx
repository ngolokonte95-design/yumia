import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { elevation, glass, gradients, radius } from '../../theme/tokens';

type Variant = keyof typeof glass;

/**
 * Surface vitrée (glassmorphism) : flou réel + liseré lumineux + éclat subtil
 * en haut. C'est la brique de base de toutes les cartes premium de Yumia.
 *
 * Sur Android, le flou natif doit être activé explicitement (`dimezisBlurView`) ;
 * sans ça `BlurView` rend un simple aplat. Le `backgroundColor` semi-opaque des
 * tokens sert de filet de sécurité si le flou n'est pas disponible.
 */
export function GlassCard({
  children,
  variant = 'card',
  style,
  rounded = radius.lg,
  glow,
  sheen = true,
}: {
  children?: ReactNode;
  /** Préréglage de verre : carte, panneau ou pastille. */
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  /** Rayon des coins — doit être porté par le conteneur qui masque le flou. */
  rounded?: number;
  /** Halo coloré autour de la carte (élément actif / mis en avant). */
  glow?: 'brand' | 'accent';
  /** Éclat dégradé en haut de la surface, façon verre éclairé. */
  sheen?: boolean;
}) {
  const preset = glass[variant];
  const glowStyle = glow === 'brand' ? elevation.glowBrand
    : glow === 'accent' ? elevation.glowAccent
    : elevation.medium;

  return (
    <View style={[{ borderRadius: rounded }, glowStyle, style]}>
      <View style={[styles.clip, { borderRadius: rounded }]}>
        <BlurView
          intensity={preset.intensity}
          tint={preset.tint}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        {sheen && (
          <LinearGradient
            colors={gradients.glassSheen}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View style={[styles.inner, preset.style, { borderRadius: rounded }]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `overflow: hidden` est indispensable : c'est lui qui découpe le flou aux
  // coins arrondis (sinon le BlurView déborde en rectangle).
  clip: { overflow: 'hidden' },
  inner: { flex: 1 },
});
