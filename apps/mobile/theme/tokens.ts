/**
 * Design system YUMIA — premium, moderne, fluide, minimaliste.
 * Inspirations : Duolingo (gamification) × ChatGPT (conversation) ×
 * Google Maps (carte) × Instagram / TikTok (feed plein écran).
 *
 * Source unique des tokens visuels ; aucun composant ne code une couleur en dur.
 */

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

export const theme = { colors, spacing, radius, typography } as const;
export type Theme = typeof theme;
