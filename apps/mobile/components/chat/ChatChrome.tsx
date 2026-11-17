/**
 * Briques visuelles partagées de la messagerie (liste, nouvelle conversation,
 * conversation). Une seule couleur d'accent : le dégradé de marque.
 * Aucun voile en dégradé linéaire vers le fond (il dessinait une « barre
 * grise ») : fonds unis, verre sobre, dégradé réservé aux éléments actifs.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../../theme/tokens';
import { PressableScale } from '../ui';

/** Fond profond, uni, de toute la messagerie. */
export const CHAT_BG = '#07070B';
/** Verre sombre des surfaces (en-tête, bulles de l'autre, barre de saisie). */
export const CHAT_GLASS = 'rgba(31,31,42,0.78)';
/** Liseré lumineux du verre. */
export const CHAT_HAIRLINE = 'rgba(255,255,255,0.10)';

/** Aplat au dégradé de marque, à poser en premier enfant d'un conteneur
 *  `overflow: 'hidden'` arrondi. */
export function BrandFill({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  );
}

/**
 * Anneau autour d'un avatar : dégradé de marque quand `active` (non lu, note
 * publiée…), simple liseré discret sinon. L'avatar enfant doit faire
 * `size - 2 * (ring + gap)` de diamètre — voir `ringInner`.
 */
export function GradientRing({
  size, active, children, ring = 2.5, background = CHAT_BG,
}: {
  size: number;
  active: boolean;
  children: ReactNode;
  ring?: number;
  background?: string;
}) {
  const inner = size - ring * 2;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      {active ? (
        <BrandFill />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
      )}
      <View
        style={{
          position: 'absolute', left: ring, top: ring, width: inner, height: inner,
          borderRadius: inner / 2, backgroundColor: background,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Diamètre de l'avatar à placer dans un `GradientRing` de taille `size`. */
export function ringInner(size: number, ring = 2.5, gap = 2): number {
  return size - (ring + gap) * 2;
}

/** Bouton rond en verre (retour, actions d'en-tête). */
export function GlassCircle({
  onPress, children, size = 40, active = false, accessibilityLabel,
}: {
  onPress: () => void;
  children: ReactNode;
  size?: number;
  /** Rempli du dégradé de marque (réglage activé). */
  active?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      hitSlop={6}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.circleActive,
      ]}
    >
      {active ? <BrandFill /> : null}
      {/* accessibilityLabel porté par le texte : PressableScale ne le relaie pas. */}
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.circleContent}>{children}</View>
    </PressableScale>
  );
}

/** Pastille de séparation de date, centrée. */
export function DatePill({ label }: { label: string }) {
  return (
    <View style={styles.datePill}>
      <Text style={styles.datePillTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  circleActive: { borderColor: 'rgba(255,255,255,0.35)' },
  circleContent: { alignItems: 'center', justifyContent: 'center' },
  datePill: {
    alignSelf: 'center', marginVertical: 14, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, backgroundColor: 'rgba(31,31,42,0.7)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  datePillTxt: { fontSize: 10.5, color: 'rgba(255,255,255,0.62)', fontWeight: '700', letterSpacing: 1 },
});
