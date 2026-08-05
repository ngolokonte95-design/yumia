/**
 * Design system YUMIA — premium, moderne, fluide, minimaliste.
 * Inspirations : Duolingo (gamification) × ChatGPT (conversation) ×
 * Google Maps (carte) × Instagram / TikTok (feed plein écran).
 *
 * Source unique des tokens visuels ; aucun composant ne code une couleur en dur.
 */
import { StyleSheet } from 'react-native';

/** Liseré le plus fin possible sur l'écran courant (1px physique). */
const hairline = StyleSheet.hairlineWidth;

export const colors = {
  // Fonds (mode sombre par défaut, premium)
  bg: '#0E0E12',
  surface: '#17171F',
  surfaceElevated: '#1F1F2A',
  border: '#2A2A38',

  // Texte
  textPrimary: '#F5F5FA',
  textSecondary: '#A6A6B8',
  textMuted: '#6E6E80',

  // Marque (orange chaleureux du PRD) + accent secondaire
  brand: '#E8621A',
  brandSoft: '#F08A4B',
  accent: '#5C4ECC',

  // États
  success: '#2BB673',
  warning: '#F2B705',
  danger: '#E5484D',

  // Compatibilité / overlays
  compatHigh: '#2BB673',
  compatMid: '#F2B705',
  overlay: 'rgba(0,0,0,0.45)',

  // Aliases (screens use these names)
  background: '#0E0E12',
  text: '#F5F5FA',
  surfaceAlt: '#1F1F2A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 32,
  pill: 999,
  full: 999,
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  // Aliases
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' as const },
} as const;

// ── Dégradés signature ───────────────────────────────────────────────────────
// L'identité Yumia : orange chaleureux → violet profond. Chaque dégradé est un
// tuple prêt à passer à <LinearGradient colors={...} />.

export const gradients = {
  /** Signature de marque, orange → violet. Boutons, accents, titres. */
  brand: ['#E8621A', '#8B4FD6', '#5C4ECC'] as const,
  /** Version douce pour les grandes surfaces (fonds de carte). */
  brandSoft: ['rgba(232,98,26,0.22)', 'rgba(92,78,204,0.18)'] as const,
  /** Voile sombre bas d'écran — lisibilité du texte sur média. */
  scrim: ['transparent', 'rgba(14,14,18,0.85)', '#0E0E12'] as const,
  /** Voile sombre haut d'écran. */
  scrimTop: ['rgba(14,14,18,0.9)', 'transparent'] as const,
  /** Surface vitrée : léger éclat en haut, transparent en bas. */
  glassSheen: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)'] as const,

  // Ambiances météo — fonds dynamiques (lot Météo).
  weatherClear: ['#1B4A8F', '#2E7DC4', '#69B4E8'] as const,
  weatherNight: ['#080B1A', '#141A38', '#2A2E55'] as const,
  weatherRain: ['#1A2430', '#33475C', '#546A80'] as const,
  weatherSnow: ['#2E3A4A', '#5A6B7D', '#93A5B5'] as const,
  weatherFog: ['#2A2E36', '#4A505C', '#727884'] as const,
  weatherStorm: ['#0D1017', '#232838', '#3D3350'] as const,
  weatherSunrise: ['#2B2350', '#B85A3C', '#F0A868'] as const,
  weatherSunset: ['#1E1B3A', '#7B3F6E', '#E8621A'] as const,
} as const;

// ── Mouvement ────────────────────────────────────────────────────────────────
// Durées et courbes uniformes : une app premium a UN vocabulaire de mouvement,
// pas dix. Les springs sont les configs à passer à withSpring() de Reanimated.

export const motion = {
  duration: {
    /** Retour tactile immédiat (scale d'un bouton). */
    instant: 120,
    /** Transition standard d'un élément (fade, slide court). */
    fast: 220,
    /** Transition d'écran ou de gros bloc. */
    normal: 340,
    /** Révélation lente, ambiance, fonds. */
    slow: 600,
  },
  /** Décalage entre deux éléments d'une liste qui apparaît en cascade. */
  stagger: 55,
  spring: {
    /** Réactif et net — boutons, cartes pressées. */
    snappy: { damping: 18, stiffness: 260, mass: 0.9 },
    /** Doux et naturel — apparitions, panneaux. */
    gentle: { damping: 22, stiffness: 140, mass: 1 },
    /** Légèrement rebondissant — succès, cœur de favori. */
    bouncy: { damping: 11, stiffness: 190, mass: 0.85 },
  },
} as const;

// ── Verre & profondeur ───────────────────────────────────────────────────────
// Glassmorphism : intensité de flou + teinte + liseré lumineux. Les composants
// passent `glass.card.intensity` à <BlurView /> et étalent `glass.card.style`.

export const glass = {
  /** Carte vitrée standard sur fond sombre. */
  card: {
    intensity: 28,
    tint: 'dark' as const,
    style: {
      backgroundColor: 'rgba(31,31,42,0.55)',
      borderWidth: hairline,
      borderColor: 'rgba(255,255,255,0.12)',
    },
  },
  /** Panneau plus opaque — feuilles modales, barres. */
  panel: {
    intensity: 45,
    tint: 'dark' as const,
    style: {
      backgroundColor: 'rgba(23,23,31,0.72)',
      borderWidth: hairline,
      borderColor: 'rgba(255,255,255,0.08)',
    },
  },
  /** Pastille légère posée sur un média. */
  pill: {
    intensity: 20,
    tint: 'dark' as const,
    style: {
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderWidth: hairline,
      borderColor: 'rgba(255,255,255,0.16)',
    },
  },
} as const;

/** Ombres réalistes, graduées par altitude perçue. */
export const elevation = {
  none: {},
  low: {
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  medium: {
    shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  high: {
    shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 }, elevation: 16,
  },
  /** Halo coloré — met en avant un élément actif (orange de marque). */
  glowBrand: {
    shadowColor: colors.brand, shadowOpacity: 0.5, shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  /** Halo violet — accents secondaires. */
  glowAccent: {
    shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
} as const;

export const theme = {
  colors, spacing, radius, typography, gradients, motion, glass, elevation,
} as const;
export type Theme = typeof theme;
