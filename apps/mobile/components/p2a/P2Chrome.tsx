/**
 * Briques visuelles des écrans Recherche, Notifications, Favoris, Mes
 * adresses, Visites et Météo (priorité 2, 18/11/2026).
 *
 * Même DA que le reste de l'app : une seule couleur d'accent (dégradé de
 * marque), verre sombre sobre, typographie forte, aucun voile en dégradé
 * linéaire vers le fond. Purement visuel : aucune donnée, aucun appel réseau.
 */
import { useState, type ReactNode, type Ref } from 'react';
import {
  I18nManager, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, gradients, radius, spacing, typography } from '../../theme/tokens';
import { PressableScale } from '../ui';

/** Flèche de retour qui suit le sens de lecture. */
export const BACK_ICON = I18nManager.isRTL ? '→' : '←';

/** Verre sombre sobre (cartes, pastilles). */
export const GLASS_CARD: ViewStyle = {
  backgroundColor: 'rgba(31,31,42,0.66)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.11)',
};

/**
 * Champ de recherche en pilule vitrée. Le liseré passe au dégradé de marque
 * quand le champ a le focus (état purement visuel).
 */
export function SearchPill({
  inputRef, value, onChangeText, placeholder, onClear, right, style, ...rest
}: {
  inputRef?: Ref<TextInputInstance>;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  /** Croix d'effacement, affichée quand il y a du texte. */
  onClear?: () => void;
  /** Élément à droite (indicateur de chargement…). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'style'>) {
  const [focused, setFocused] = useState(false);
  const inner = (
    <View style={[styles.searchInner, focused && styles.searchInnerFocused]}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        ref={inputRef}
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
      />
      {right}
      {onClear && value.length > 0 ? (
        <PressableScale onPress={onClear} hitSlop={10} scaleTo={0.85} style={styles.clearBtn}>
          <Text style={styles.clearText}>✕</Text>
        </PressableScale>
      ) : null}
    </View>
  );
  // Le liseré dégradé est un cadre de 1,5 px autour du champ.
  return focused ? (
    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.searchFrame, style]}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[styles.searchFrame, styles.searchFrameIdle, style]}>{inner}</View>
  );
}

/** Petite pastille d'information en verre (date, ville, XP…). */
export function InfoPill({ label, brand = false, style }: { label: string; brand?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, brand && styles.pillBrand, style]}>
      {brand ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      <Text style={[styles.pillText, brand && styles.pillTextBrand]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Icône dans un médaillon rond. `lit` : anneau au dégradé de marque et halo
 * (élément nouveau / actif) ; sinon verre discret.
 */
export function IconMedal({ icon, size = 46, lit = false }: { icon: ReactNode; size?: number; lit?: boolean }) {
  const content = typeof icon === 'string' ? <Text style={{ fontSize: size * 0.44 }}>{icon}</Text> : icon;
  if (!lit) {
    return (
      <View style={[styles.medal, GLASS_CARD, { width: size, height: size, borderRadius: size / 2 }]}>{content}</View>
    );
  }
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ width: size, height: size, borderRadius: size / 2, padding: 2 }, elevation.glowBrand]}
    >
      <View style={[styles.medal, styles.medalInner, { borderRadius: (size - 4) / 2 }]}>{content}</View>
    </LinearGradient>
  );
}

/** Bouton rond en verre (actions secondaires d'une ligne : ✕, ⋯). */
export function GlassDot({ label, onPress, size = 34, hitSlop = 10 }: {
  label: string; onPress: () => void; size?: number; hitSlop?: number;
}) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={hitSlop}
      scaleTo={0.86}
      style={[styles.dot, GLASS_CARD, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={styles.dotText}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  searchFrame: { borderRadius: radius.pill, padding: 1.5 },
  searchFrameIdle: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', padding: 1.5 - StyleSheet.hairlineWidth },
  searchInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(23,23,31,0.94)', borderRadius: radius.pill,
    paddingStart: spacing.md, paddingEnd: 8, height: 46,
  },
  searchInnerFocused: { backgroundColor: 'rgba(23,23,31,0.98)' },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: 0 },
  clearBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clearText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },

  pill: {
    alignSelf: 'flex-start', overflow: 'hidden', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4, ...GLASS_CARD,
  },
  pillBrand: { borderColor: 'transparent' },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  pillTextBrand: { color: '#fff', fontWeight: '900' },

  medal: { alignItems: 'center', justifyContent: 'center' },
  medalInner: { flex: 1, backgroundColor: colors.bg },

  dot: { alignItems: 'center', justifyContent: 'center' },
  dotText: { color: colors.textSecondary, fontSize: 14, fontWeight: '900', marginTop: -1 },
});
