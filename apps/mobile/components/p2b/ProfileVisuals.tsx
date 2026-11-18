/**
 * Briques visuelles des profils sociaux (mon profil, profil d'un autre
 * utilisateur) et de la carte des gens autour — DA du 18/11/2026.
 *
 * Une seule couleur d'accent : le dégradé de marque (orange → violet), avec
 * retenue. Verre sombre sobre. Aucun voile en dégradé linéaire vers le fond
 * (ils dessinaient une « barre grise ») : le seul halo est RADIAL (SVG), il
 * s'éteint en cercle derrière l'avatar, sans bord ni bande.
 * Purement visuel : ces composants ne font aucun appel réseau.
 */
import type { ReactNode } from 'react';
import {
  I18nManager, Modal, Pressable, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors, elevation, gradients, radius, spacing } from '../../theme/tokens';
import { CrystalFill, GradientText, PressableScale, Reveal } from '../ui';
import { CountUp, GLASS, IconBubble } from '../profile/ProfileChrome';
import { haptics } from '../../lib/useHaptics';

/** Flèche de retour qui suit le sens de lecture. */
export const BACK_ARROW = I18nManager.isRTL ? '→' : '←';

// ── Halo radial derrière l'avatar ───────────────────────────────────────────

export function AvatarHalo({ size }: { size: number }) {
  return (
    <View pointerEvents="none" style={[styles.halo, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="p2bHalo" cx="50%" cy="50%" r="50%">
            {/* 18/11 : profils sobres — éclat argent froid, plus de couleur. */}
            <Stop offset="0" stopColor="#DCE4F0" stopOpacity="0.12" />
            <Stop offset="0.5" stopColor="#DCE4F0" stopOpacity="0.035" />
            <Stop offset="1" stopColor="#DCE4F0" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#p2bHalo)" />
      </Svg>
    </View>
  );
}

// ── Anneaux d'avatar ────────────────────────────────────────────────────────

/** Anneau au dégradé de marque (story active). */
export function BrandRing({ size, thickness = 3, children }: { size: number; thickness?: number; children: ReactNode }) {
  return (
    <LinearGradient
      colors={gradients.brand}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: thickness }}
    >
      <View style={[styles.ringInner, { borderRadius: (size - thickness * 2) / 2 }]}>{children}</View>
    </LinearGradient>
  );
}

/** Anneau discret en verre (pas de story) ; pointillé si `dashed`. */
export function QuietRing({ size, thickness = 3, dashed = false, children }: {
  size: number; thickness?: number; dashed?: boolean; children: ReactNode;
}) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, padding: thickness,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.24)', borderStyle: dashed ? 'dashed' : 'solid',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <View style={[styles.ringInner, { borderRadius: size / 2 }]}>{children}</View>
    </View>
  );
}

/** Pastille ronde sertie de cristal (« + » de story, coche…). */
export function BrandBadge({ label, size = 30, onPress, style }: {
  label: string; size?: number; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <View style={[styles.brandBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <CrystalFill edge={1.4} />
      <Text style={[styles.brandBadgeText, { fontSize: size * 0.56 }]}>{label}</Text>
    </View>
  );
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <PressableScale style={style} onPress={() => { haptics.select(); onPress(); }} scaleTo={0.88} hitSlop={8}>
      {body}
    </PressableScale>
  );
}

// ── Compteurs ───────────────────────────────────────────────────────────────

/** Barre vitrée de compteurs, filets fins entre les cases. */
export function StatsBar({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={[styles.statsBar, GLASS]}>
      {items.map((child, i) => (
        <View key={i} style={styles.statsCellWrap}>
          {i > 0 ? <View style={styles.statsSep} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

/** Une case : chiffre réel qui monte depuis 0, libellé en petites capitales. */
export function StatCell({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const content = (
    <>
      <CountUp value={value} style={styles.statNum} />
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={styles.statCell}>{content}</View>;
  return (
    <PressableScale style={styles.statCell} onPress={onPress} scaleTo={0.94}>
      {content}
    </PressableScale>
  );
}

// ── Boutons d'action ────────────────────────────────────────────────────────

/** Bouton d'action : verre serti de cristal (`primary`) ou verre simple. */
export function ActionButton({
  label, onPress, primary = false, icon, badge, style, textStyle, accessibilityLabel,
}: {
  label?: string;
  onPress: () => void;
  primary?: boolean;
  icon?: string;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      style={[styles.action, primary ? styles.actionPrimary : [styles.actionGlass, GLASS], style]}
      onPress={() => { haptics.select(); onPress(); }}
      scaleTo={0.95}
      haptic={false}
    >
      {primary ? <CrystalFill /> : null}
      <View accessibilityLabel={accessibilityLabel} style={styles.actionInner}>
        {icon ? <Text style={styles.actionIcon}>{icon}</Text> : null}
        {label && primary ? (
          <GradientText style={[styles.actionText, styles.actionTextPrimary, textStyle]} colors={gradients.crystal} numberOfLines={1}>
            {label}
          </GradientText>
        ) : label ? (
          <Text style={[styles.actionText, textStyle]} numberOfLines={1}>{label}</Text>
        ) : null}
      </View>
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** Bouton rond en verre, petit (barre du haut). */
export function TopGlassButton({ label, onPress, accessibilityLabel, size = 38 }: {
  label: string; onPress: () => void; accessibilityLabel?: string; size?: number;
}) {
  return (
    <PressableScale
      style={[styles.topBtn, GLASS, { width: size, height: size, borderRadius: size / 2 }]}
      onPress={() => { haptics.select(); onPress(); }}
      scaleTo={0.88}
      hitSlop={4}
    >
      <Text style={styles.topBtnText} accessibilityLabel={accessibilityLabel}>{label}</Text>
    </PressableScale>
  );
}

// ── Onglets en pastilles ────────────────────────────────────────────────────

export type PillTab<K extends string> = { key: K; icon?: string; label?: string; badge?: number };

/** Onglets en pastilles dans un rail vitré : l'actif est serti de cristal. */
export function PillTabs<K extends string>({ tabs, active, onChange, style }: {
  tabs: PillTab<K>[];
  active: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pillRail, GLASS, style]}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <PressableScale
            key={tab.key}
            style={[styles.pill, on && styles.pillOn]}
            onPress={() => { if (!on) haptics.select(); onChange(tab.key); }}
            scaleTo={0.94}
          >
            {on ? <CrystalFill edge={1} /> : null}
            {tab.icon ? <Text style={[styles.pillIcon, on && styles.pillTextOn]}>{tab.icon}</Text> : null}
            {tab.label && on ? (
              <GradientText style={[styles.pillLabel, styles.pillTextOn]} colors={gradients.crystal} numberOfLines={1}>{tab.label}</GradientText>
            ) : tab.label ? (
              <Text style={styles.pillLabel} numberOfLines={1}>{tab.label}</Text>
            ) : null}
            {tab.badge && tab.badge > 0 ? (
              <View style={[styles.pillBadge, on && styles.pillBadgeOn]}>
                <Text style={styles.pillBadgeText}>{tab.badge}</Text>
              </View>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── Grille de publications ──────────────────────────────────────────────────

/** Case de la grille, coins arrondis ; les 9 premières apparaissent en cascade. */
export function GridTile({ size, index, onPress, onLongPress, children }: {
  size: number;
  index: number;
  onPress: () => void;
  onLongPress?: () => void;
  children: ReactNode;
}) {
  const tile = (
    <PressableScale
      style={[styles.tile, { width: size, height: size }]}
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.96}
    >
      {children}
    </PressableScale>
  );
  return index < 9 ? <Reveal index={index} from="fade">{tile}</Reveal> : tile;
}

/** Petite pastille vitrée posée sur une vignette. */
export function TileBadge({ children, corner }: { children: ReactNode; corner: 'tl' | 'tr' | 'bl' }) {
  const pos = corner === 'tl' ? { top: 6, start: 6 } : corner === 'tr' ? { top: 6, end: 6 } : { bottom: 6, start: 6 };
  return <View style={[styles.tileBadge, pos]}>{children}</View>;
}

// ── Story à la une ──────────────────────────────────────────────────────────

/** Bulle de story à la une (ou « nouvelle », en pointillé). */
export function HighlightBubble({ label, cover, add = false, onPress, onLongPress }: {
  label: string;
  cover?: ReactNode;
  add?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <PressableScale style={styles.hlItem} onPress={onPress} onLongPress={onLongPress} scaleTo={0.92}>
      {add ? (
        <View style={[styles.hlBubble, styles.hlBubbleAdd]}>
          <Text style={styles.hlAdd}>＋</Text>
        </View>
      ) : (
        <BrandRing size={66} thickness={2}>
          <View style={styles.hlInner}>{cover}</View>
        </BrandRing>
      )}
      <Text style={styles.hlLabel} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );
}

// ── Feuille de menu ─────────────────────────────────────────────────────────

export type SheetItem = { icon: string; label: string; onPress: () => void; danger?: boolean };

/** Feuille du bas sombre : poignée de marque, lignes à icône dans un rond en verre. */
export function SheetMenu({ visible, onClose, items, bottomInset, cancelLabel }: {
  visible: boolean;
  onClose: () => void;
  items: SheetItem[];
  bottomInset: number;
  cancelLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={[styles.sheetGroup, GLASS]}>
          {items.map((item, i) => (
            <View key={item.label}>
              {i > 0 ? <View style={styles.sheetSep} /> : null}
              <PressableScale style={styles.sheetRow} onPress={() => { haptics.select(); item.onPress(); }} scaleTo={0.98}>
                <IconBubble icon={item.icon} danger={item.danger} />
                <Text style={[styles.sheetLabel, item.danger && styles.sheetLabelDanger]} numberOfLines={2}>{item.label}</Text>
              </PressableScale>
            </View>
          ))}
        </View>
        {cancelLabel ? (
          <PressableScale style={[styles.sheetCancel, GLASS]} onPress={onClose} scaleTo={0.98}>
            <Text style={styles.sheetCancelText}>{cancelLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Pastille de sélection ───────────────────────────────────────────────────

/**
 * Pastille de choix : verre au repos, sertie de cristal quand elle est
 * choisie. `fill` : occupe toute la largeur de sa case (rangées égales).
 */
export function SelectChip({ label, active, onPress, fill = false }: {
  label: string; active: boolean; onPress: () => void; fill?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.selChip, GLASS, fill && styles.selChipFill, active && styles.selChipOn]}
      onPress={() => { if (!active) haptics.select(); onPress(); }}
      scaleTo={0.94}
    >
      {active ? <CrystalFill edge={1} /> : null}
      {active ? (
        <GradientText style={[styles.selChipText, styles.selChipTextOn]} colors={gradients.crystal} numberOfLines={1}>{label}</GradientText>
      ) : (
        <Text style={styles.selChipText} numberOfLines={1}>{label}</Text>
      )}
    </PressableScale>
  );
}

// ── Pastille vitrée de texte ────────────────────────────────────────────────

export function GlassPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.glassPill, GLASS, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', left: '50%', top: '50%' },
  ringInner: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  brandBadge: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.bg,
    borderWidth: 2.5, borderColor: colors.bg,
  },
  brandBadgeText: { color: '#F4F7FB', fontWeight: '700', marginTop: -1 },

  statsBar: { flexDirection: 'row', borderRadius: radius.lg, paddingVertical: spacing.md },
  statsCellWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statsSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center', padding: 0, minWidth: 40 },
  statLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },

  action: {
    height: 44, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md,
  },
  actionPrimary: {},
  actionGlass: {},
  actionInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 16 },
  actionText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  actionTextPrimary: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 0.3 },
  badge: {
    position: 'absolute', top: 4, end: 6,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  topBtn: { alignItems: 'center', justifyContent: 'center' },
  topBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  pillRail: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  pill: {
    flex: 1, height: 38, borderRadius: radius.pill, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8,
  },
  pillOn: {},
  pillIcon: { color: colors.textMuted, fontSize: 17, fontWeight: '800' },
  pillLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  pillTextOn: { color: '#fff' },
  pillBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pillBadgeOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  pillBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  tile: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  tileBadge: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.62)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },

  hlItem: { alignItems: 'center', width: 74, gap: 6 },
  hlBubble: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hlBubbleAdd: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.32)', backgroundColor: 'rgba(31,31,42,0.5)' },
  hlAdd: { color: colors.textSecondary, fontSize: 24 },
  hlInner: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  hlLabel: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    ...elevation.high,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: spacing.sm },
  sheetGroup: { borderRadius: radius.lg, overflow: 'hidden' },
  sheetSep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginStart: spacing.md + 36 + spacing.md },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 58 },
  sheetLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  sheetLabelDanger: { color: colors.danger },
  sheetCancel: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', height: 52 },
  sheetCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '800' },

  selChip: {
    height: 40, paddingHorizontal: 16, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  selChipFill: { flex: 1, paddingHorizontal: 8 },
  selChipOn: { borderColor: 'transparent' },
  selChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  selChipTextOn: { color: '#FFFFFF', fontWeight: '900' },

  glassPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill,
  },
});
