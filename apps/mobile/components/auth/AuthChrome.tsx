/**
 * Briques visuelles des écrans d'entrée (connexion, inscription, mot de passe
 * oublié, réinitialisation, démarrage) — 17/11/2026.
 *
 * Même univers que l'Accueil : fond « espace profond » (SpaceBackground),
 * panneaux de verre sombre sobres, une seule couleur d'accent — le dégradé de
 * marque — et aucun voile en dégradé linéaire vers le fond.
 *
 * Purement visuel : aucune de ces briques ne connaît l'authentification. Les
 * écrans leur passent valeurs et gestionnaires tels quels.
 */
import { forwardRef, useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, I18nManager, Image, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { SpaceBackground, SPACE_BLACK } from '../space/SpaceBackground';
import { PressableScale } from '../ui';
import { PasswordInput } from '../PasswordInput';
import { colors, elevation, gradients, radius, spacing, typography } from '../../theme/tokens';

export { SPACE_BLACK };

/** Vrai tant que l'écran est affiché : le fond animé s'arrête ailleurs. */
export function useScreenActive(): boolean {
  const [active, setActive] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  return active;
}

/** Fond spatial plein écran, fixe, derrière tout le contenu. */
export function SpaceBackdrop() {
  const active = useScreenActive();
  return <SpaceBackground active={active} />;
}

// ── Logo ─────────────────────────────────────────────────────────────────────

/**
 * Logo YUMIA qui entre en douceur, posé sur un halo radial au dégradé de
 * marque (un cercle qui s'éteint : pas de bord, pas de bande).
 */
export function AuthLogo({ size = 132 }: { size?: number }) {
  const halo = size * 2;
  return (
    <View style={[styles.logoWrap, { width: halo, height: size * 1.25 }]}>
      <Animated.View entering={ZoomIn.duration(900)} style={[styles.logoHalo, { width: halo, height: halo, top: (size * 1.25 - halo) / 2 }]} pointerEvents="none">
        <Svg width={halo} height={halo}>
          <Defs>
            <RadialGradient id="authHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.brand} stopOpacity="0.32" />
              <Stop offset="0.45" stopColor="#8B4FD6" stopOpacity="0.14" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill="url(#authHalo)" />
        </Svg>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(700).springify().damping(16)}>
        <Image source={require('../../assets/logo.png')} style={{ width: size, height: size }} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

// ── Panneau vitré ────────────────────────────────────────────────────────────

export function GlassPanel({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, style]}>
      <LinearGradient colors={gradients.glassSheen} style={[StyleSheet.absoluteFill, styles.panelSheen]} pointerEvents="none" />
      {children}
    </View>
  );
}

// ── Champs ───────────────────────────────────────────────────────────────────

/** Fusionne un gestionnaire de l'écran avec le suivi visuel du focus. */
function useFocusRing(onFocus?: TextInputProps['onFocus'], onBlur?: TextInputProps['onBlur']) {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: ((e) => { setFocused(true); onFocus?.(e); }) as TextInputProps['onFocus'],
    onBlur: ((e) => { setFocused(false); onBlur?.(e); }) as TextInputProps['onBlur'],
  };
}

/** Champ texte vitré ; liseré de marque quand il a le focus. */
export const GlassInput = forwardRef<TextInputInstance, TextInputProps>(function GlassInput(
  { style, onFocus, onBlur, ...props },
  ref,
) {
  const ring = useFocusRing(onFocus, onBlur);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textMuted}
      {...props}
      onFocus={ring.onFocus}
      onBlur={ring.onBlur}
      style={[styles.input, ring.focused && styles.inputFocused, style]}
    />
  );
});

/** Même champ, en mot de passe (œil pour afficher/masquer, cf. PasswordInput). */
export const GlassPasswordInput = forwardRef<TextInputInstance, Omit<TextInputProps, 'secureTextEntry'>>(
  function GlassPasswordInput({ style, onFocus, onBlur, ...props }, ref) {
    const ring = useFocusRing(onFocus, onBlur);
    return (
      <PasswordInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        {...props}
        onFocus={ring.onFocus}
        onBlur={ring.onBlur}
        style={[styles.input, ring.focused && styles.inputFocused, style]}
      />
    );
  },
);

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// ── Boutons ──────────────────────────────────────────────────────────────────

/** Bouton principal : dégradé de marque, reflet, halo. */
export function BrandButton({
  label, onPress, disabled, loading, style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      style={[styles.brandBtn, !disabled && elevation.glowBrand, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.97}
      haptic
    >
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.pillClip]} />
      <LinearGradient colors={gradients.glassSheen} style={[StyleSheet.absoluteFill, styles.pillClip]} />
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.brandBtnText}>{label}</Text>}
    </PressableScale>
  );
}

/**
 * Bouton Google, version sombre conforme aux consignes de marque Google
 * (fond #131314, contour #8E918F, texte blanc).
 */
export function GoogleButton({
  label, onPress, disabled, loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <PressableScale style={[styles.googleBtn, disabled && styles.disabled]} onPress={onPress} disabled={disabled} scaleTo={0.97}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.googleText}>{label}</Text>}
    </PressableScale>
  );
}

/** Lien discret (texte orange doux). */
export function TextLink({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <PressableScale style={[styles.textLink, style]} onPress={onPress} scaleTo={0.96} hitSlop={8}>
      <Text style={styles.textLinkText}>{label}</Text>
    </PressableScale>
  );
}

/** Bouton retour rond en verre ; la flèche suit le sens de lecture. */
export function GlassBackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale style={styles.back} onPress={onPress} scaleTo={0.9} hitSlop={8}>
      <Text style={styles.backText}>{I18nManager.isRTL ? '→' : '←'}</Text>
    </PressableScale>
  );
}

// ── Divers ───────────────────────────────────────────────────────────────────

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/** Message d'erreur lisible : pastille sombre à liseré rouge fonctionnel. */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={styles.errorBox}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorText}>{message}</Text>
    </Animated.View>
  );
}

/** Grand titre au dégradé de marque + sous-titre. */
export function HeroTitle({ title, subtitle, center }: { title: string; subtitle?: string; center?: boolean }) {
  const align: TextStyle = center ? { textAlign: 'center' } : {};
  return (
    <View style={styles.heroTitle}>
      <Text style={[styles.title, align]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, align]}>{subtitle}</Text> : null}
    </View>
  );
}

/** Médaillon rond au dégradé de marque (emoji au centre). */
export function BrandMedal({ emoji, size = 76 }: { emoji: string; size?: number }) {
  return (
    <Animated.View entering={ZoomIn.duration(500)} style={[styles.medal, { width: size, height: size, borderRadius: size / 2 }, elevation.glowBrand]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      <LinearGradient colors={gradients.glassSheen} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} />
      <Text style={{ fontSize: size * 0.44 }}>{emoji}</Text>
    </Animated.View>
  );
}

/** Progression de l'onboarding : segments, ceux franchis au dégradé. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={styles.progressSeg}>
          {i <= step ? (
            <Animated.View entering={FadeInDown.duration(260)} style={StyleSheet.absoluteFill}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Pastille sélectionnable : verre au repos, dégradé de marque une fois choisie. */
export function SelectChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale style={[styles.chip, active && styles.chipActive]} onPress={onPress} scaleTo={0.94} haptic>
      {active ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.pillClip]} />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  logoWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  logoHalo: { position: 'absolute' },

  panel: {
    backgroundColor: 'rgba(20,20,28,0.78)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...elevation.medium,
  },
  panelSheen: { borderRadius: radius.xl, opacity: 0.6 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputFocused: { borderColor: colors.brand, backgroundColor: 'rgba(232,98,26,0.07)' },
  fieldLabel: { ...typography.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1.2 },

  brandBtn: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillClip: { borderRadius: radius.pill },
  brandBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  disabled: { opacity: 0.45 },

  googleBtn: {
    height: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131314',
    borderWidth: 1,
    borderColor: '#8E918F',
  },
  googleText: { color: '#E3E3E3', fontSize: 16, fontWeight: '600' },

  textLink: { alignSelf: 'center', paddingVertical: spacing.xs },
  textLinkText: { ...typography.caption, color: colors.brandSoft, fontWeight: '700' },

  back: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,20,28,0.78)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  backText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' },
  dividerText: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: 'rgba(229,72,77,0.12)', borderColor: 'rgba(229,72,77,0.45)', borderWidth: 1,
    borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md,
  },
  errorIcon: { fontSize: 14, marginTop: 1 },
  errorText: { ...typography.caption, color: '#FF9DA0', flex: 1, lineHeight: 18 },

  heroTitle: { gap: 6 },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  medal: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  progressRow: { flexDirection: 'row', gap: 6 },
  progressSeg: {
    flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)',
  },

  chip: {
    paddingVertical: 11, paddingHorizontal: spacing.md + 2, borderRadius: radius.pill, overflow: 'hidden',
    backgroundColor: 'rgba(20,20,28,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { borderColor: 'transparent' },
  chipText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '800' },
});
