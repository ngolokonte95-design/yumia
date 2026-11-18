/**
 * Briques de l'espace admin (tableau de bord, comptes, modération, commandes).
 *
 * Consigne de l'utilisateur (18/11/2026) : « spectaculaire mais éviter trop de
 * couleur, il faut que ça reste simple ». Tout est donc en verre sombre et en
 * blanc : chiffres forts, libellés en petites capitales, barres neutres. Le
 * dégradé de marque n'apparaît qu'à un ou deux endroits par écran. Les seules
 * autres couleurs sont FONCTIONNELLES : vert (actif, positif), jaune
 * (suspension), rouge (alerte, sanction, action irréversible).
 *
 * Purement visuel : aucune de ces briques n'appelle le réseau ni ne calcule
 * de donnée — elles n'affichent que ce qu'on leur passe.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';
import { PressableScale } from '../ui';
import { CHEVRON, CountUp, GLASS } from '../profile/ProfileChrome';
import { haptics } from '../../lib/useHaptics';

/** Indicateur de chargement neutre. */
export const ADMIN_SPINNER = 'rgba(255,255,255,0.75)';

// ── Titre de section ────────────────────────────────────────────────────────

/** Petites capitales espacées + filet fin, avec un élément facultatif à droite. */
export function AdminSection({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.sectionRule} />
      {right}
    </View>
  );
}

// ── Carte vitrée ────────────────────────────────────────────────────────────

/** `alert` : liseré rouge (sanction en cours, commande à payer). */
export function AdminCard({
  children, style, alert = false,
}: { children: ReactNode; style?: StyleProp<ViewStyle>; alert?: boolean }) {
  return <View style={[styles.card, GLASS, alert && styles.cardAlert, style]}>{children}</View>;
}

// ── Chiffres clés ───────────────────────────────────────────────────────────

/**
 * Tuile de chiffre : la valeur monte depuis zéro quand c'est un nombre.
 * `hero` : grand format sur toute la largeur (le chiffre principal de l'écran).
 * `onPress` : la tuile ouvre la liste qu'elle compte (chevron discret).
 */
export function StatTile({
  label, value, sub, onPress, hero = false, third = false, danger = false, style,
}: {
  label: string;
  value: number | string;
  sub?: string;
  onPress?: () => void;
  hero?: boolean;
  /** Trois tuiles par ligne au lieu de deux (chiffre un peu plus petit). */
  third?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const valueStyle: StyleProp<TextStyle> = [
    hero ? styles.tileValueHero : third ? styles.tileValueThird : styles.tileValue,
    danger && styles.danger,
  ];
  const body = (
    <>
      <View style={styles.tileTop}>
        <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
        {onPress ? <Text style={styles.tileChevron}>{CHEVRON}</Text> : null}
      </View>
      {typeof value === 'number' ? (
        <CountUp value={value} style={valueStyle} />
      ) : (
        <Text style={valueStyle} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      )}
      {sub ? <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text> : null}
    </>
  );
  const box = [styles.tile, GLASS, hero && styles.tileHero, third && styles.tileThird, style];
  return onPress ? (
    <PressableScale style={box} onPress={() => { haptics.select(); onPress(); }} scaleTo={0.96}>{body}</PressableScale>
  ) : (
    <View style={box}>{body}</View>
  );
}

/** Grille de tuiles : deux par ligne, quelle que soit la largeur. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

// ── Barres ──────────────────────────────────────────────────────────────────

/** Jauge horizontale neutre. `ratio` entre 0 et 1, calculé par l'appelant. */
export function Gauge({ ratio, style }: { ratio: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100;
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

/** Ligne « libellé — jauge — valeur » (répartitions par pays, univers, partenaire…). */
export function BarRow({
  lead, label, ratio, value, trailing, onPress, labelWidth = 118,
}: {
  /** Élément en tête de ligne (drapeau…). */
  lead?: ReactNode;
  label: string;
  ratio: number;
  value: number | string;
  /** Second chiffre à droite (pourcentage, conversions…). */
  trailing?: string;
  onPress?: () => void;
  labelWidth?: number;
}) {
  const row = (
    <>
      {lead}
      <Text style={[styles.barLabel, { width: labelWidth }]} numberOfLines={1}>{label}</Text>
      <Gauge ratio={ratio} style={{ flex: 1 }} />
      <Text style={styles.barValue}>{value}</Text>
      {trailing ? <Text style={styles.barTrailing} numberOfLines={1}>{trailing}</Text> : null}
    </>
  );
  return onPress ? (
    <PressableScale style={styles.barRow} onPress={onPress} scaleTo={0.98}>{row}</PressableScale>
  ) : (
    <View style={styles.barRow}>{row}</View>
  );
}

/**
 * Histogramme journalier : une barre par jour, hauteur relative au maximum de
 * la série. Seules quelques dates sont écrites (une sur `every`) pour rester
 * lisible ; toutes les barres sont tracées.
 */
export function DayBars({
  data, every = 5,
}: { data: Array<{ date: string; count: number }>; every?: number }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <View>
      <View style={styles.chart}>
        {data.map((d) => (
          <View key={d.date} style={styles.chartCol}>
            <View style={[styles.chartBar, { height: `${(d.count / max) * 100}%` }, d.count === max && styles.chartBarMax]} />
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        {data.map((d, i) => (
          <View key={d.date} style={styles.chartCol}>
            {i % every === 0 || i === data.length - 1 ? (
              <Text style={styles.chartLabel} numberOfLines={1}>{d.date.slice(5)}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Pastilles d'état ────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'plan';

const BADGE_COLOR: Record<BadgeTone, string> = {
  neutral: colors.textSecondary,
  ok: colors.success,
  warn: colors.warning,
  danger: colors.danger,
  plan: colors.textPrimary,
};

/** Pastille discrète : texte coloré sur fond à peine teinté (couleur fonctionnelle). */
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const color = BADGE_COLOR[tone];
  return (
    <View style={[styles.badge, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Compteur d'alerte (signalements, commandes en attente) : rouge fonctionnel. */
export function AlertCount({ count }: { count: number }) {
  return (
    <View style={styles.alertCount}>
      <Text style={styles.alertCountText}>{count}</Text>
    </View>
  );
}

// ── Lignes ──────────────────────────────────────────────────────────────────

/** Initiale dans un rond de verre (les comptes n'ont pas de photo dans l'admin). */
export function InitialAvatar({ name, size = 42 }: { name?: string | null; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

/** Ligne de navigation : pictogramme, titre, précision, élément d'état, chevron. */
export function NavRow({
  icon, title, hint, trailing, onPress,
}: { icon: string; title: string; hint?: string; trailing?: ReactNode; onPress: () => void }) {
  return (
    <PressableScale style={styles.navRow} onPress={() => { haptics.select(); onPress(); }} scaleTo={0.98}>
      <View style={styles.navIcon}><Text style={styles.navIconText}>{icon}</Text></View>
      <View style={styles.navText}>
        <Text style={styles.navTitle} numberOfLines={1}>{title}</Text>
        {hint ? <Text style={styles.navHint} numberOfLines={2}>{hint}</Text> : null}
      </View>
      {trailing}
      <Text style={styles.navChevron}>{CHEVRON}</Text>
    </PressableScale>
  );
}

/** Ligne « libellé : valeur » d'une fiche. */
export function InfoRow({ label, value, flush = false }: {
  label: string;
  value: string;
  /** Sans marge latérale : la ligne est déjà dans une carte à marge. */
  flush?: boolean;
}) {
  return (
    <View style={[styles.infoRow, flush && styles.infoRowFlush]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

// ── Boutons ─────────────────────────────────────────────────────────────────

type ButtonTone = 'solid' | 'glass' | 'ok' | 'warn' | 'danger';

/**
 * Bouton d'action. `solid` = blanc (action principale), `glass` = neutre,
 * `ok` / `warn` / `danger` = verre à liseré et texte de la couleur
 * fonctionnelle (lever, suspendre, bannir / retirer).
 */
export function AdminButton({
  label, onPress, tone = 'glass', loading = false, disabled = false, style,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : tone === 'danger' ? colors.danger : null;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.96}
      style={[
        styles.button,
        tone === 'solid' ? styles.buttonSolid : GLASS,
        tint ? { borderColor: `${tint}66`, backgroundColor: `${tint}14` } : null,
        (disabled || loading) && styles.buttonOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone === 'solid' ? colors.bg : (tint ?? ADMIN_SPINNER)} />
      ) : (
        <Text
          style={[styles.buttonText, tone === 'solid' && styles.buttonTextSolid, tint ? { color: tint } : null]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

// ── États ───────────────────────────────────────────────────────────────────

/** Bandeau d'erreur lisible (rouge fonctionnel, discret). */
export function ErrorBanner({ message, style }: { message: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.error, style]}>
      <Text style={styles.errorText}>⚠️ {message}</Text>
    </View>
  );
}

/** Chargement plein écran. */
export function AdminLoading({ paddingTop = 0 }: { paddingTop?: number }) {
  return (
    <View style={[styles.loading, { paddingTop }]}>
      <ActivityIndicator color={ADMIN_SPINNER} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  danger: { color: colors.danger },

  section: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.8,
    textTransform: 'uppercase', flexShrink: 1,
  },
  sectionRule: { flex: 1, minWidth: 16, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.14)' },

  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md },
  cardAlert: { borderColor: `${colors.danger}77`, borderWidth: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  tile: { width: '48.6%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14, minHeight: 96, justifyContent: 'space-between' },
  tileHero: { width: '100%', minHeight: 124, paddingVertical: spacing.md },
  tileThird: { width: '31.6%', paddingHorizontal: 12 },
  tileValueThird: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, fontVariant: ['tabular-nums'], marginTop: 6 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tileLabel: {
    flex: 1, color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.3,
    textTransform: 'uppercase', lineHeight: 14,
  },
  tileChevron: { color: colors.textMuted, fontSize: 18, fontWeight: '300', marginTop: -4 },
  tileValue: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, fontVariant: ['tabular-nums'], marginTop: 6 },
  tileValueHero: { color: colors.textPrimary, fontSize: 56, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'], marginTop: 2 },
  tileSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },

  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.09)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.82)' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  barLabel: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  barValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '800', minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  barTrailing: { color: colors.textMuted, fontSize: 12, fontWeight: '600', minWidth: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 2 },
  chartCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  chartBar: { width: '78%', minHeight: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.42)' },
  chartBarMax: { backgroundColor: '#fff' },
  chartAxis: { flexDirection: 'row', gap: 2, height: 16, marginTop: 6 },
  // Le libellé déborde de sa colonne étroite : largeur fixe centrée dessus.
  chartLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '600', width: 34, textAlign: 'center' },

  badge: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  alertCount: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger,
  },
  alertCountText: { color: '#fff', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },

  avatar: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  avatarText: { color: colors.textPrimary, fontWeight: '900' },

  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14, minHeight: 68 },
  navIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  navIconText: { fontSize: 18 },
  navText: { flex: 1, minWidth: 0 },
  navTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  navHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  navChevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12 },
  infoRowFlush: { paddingHorizontal: 0, paddingVertical: 8 },
  infoLabel: { color: colors.textMuted, fontSize: 13 },
  infoValue: { color: colors.textPrimary, fontSize: 13.5, fontWeight: '700', flexShrink: 1, textAlign: 'right' },

  button: { minHeight: 44, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonSolid: { backgroundColor: '#fff' },
  buttonOff: { opacity: 0.5 },
  buttonText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  buttonTextSolid: { color: colors.bg },

  error: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, padding: spacing.md,
    backgroundColor: `${colors.danger}1A`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.danger}66`,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
