/**
 * Sélecteur du rayon de recherche de la carte (18/11, demande de
 * l'utilisateur : « beaucoup plus spectaculaire »).
 *
 * - RadiusChip : la pastille « 5 km » de la barre de la carte, sertie de
 *   cristal, avec un mini radar dont une onde part de temps en temps.
 * - RadiusPanel : le panneau ouvert. Un radar dont chaque anneau est un des
 *   rayons proposés : l'anneau choisi s'allume, la zone couverte s'éclaire,
 *   un balayage tourne à l'intérieur et une onde part à chaque choix. Dessous,
 *   une glissière de verre dont le curseur de cristal glisse jusqu'au rayon
 *   touché.
 *
 * Un seul accent : le dégradé de marque, sur l'anneau choisi et le point
 * central. Tout le reste est en verre et cristal. Aucun voile linéaire : la
 * lueur du panneau est radiale.
 */
import { useEffect, useRef, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { CrystalFill, GradientText, PressableScale } from '../ui';
import { gradients, motion, radius, spacing } from '../../theme/tokens';
import { haptics } from '../../lib/useHaptics';

const [BRAND_A, BRAND_B, BRAND_C] = gradients.brand;

/** Anneau le plus proche d'un rayon hors des préréglages (ancienne valeur). */
function nearestIndex(presets: readonly number[], km: number): number {
  let best = 0;
  presets.forEach((v, i) => {
    if (Math.abs(v - km) < Math.abs(presets[best] - km)) best = i;
  });
  return best;
}

// ── Pastille ────────────────────────────────────────────────────────────────

const MINI = 18;

export function RadiusChip({ km, open, onPress }: { km: number; open: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const ping = useSharedValue(1);

  // Une onde discrète toutes les ~3 s : la pastille paraît « vivante » sans
  // attirer l'œil en permanence. Animée côté UI : aucun rendu React.
  useEffect(() => {
    if (reduced) return;
    ping.value = 0;
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 1600 }),
      ),
      -1,
    );
    return () => cancelAnimation(ping);
  }, [reduced, ping]);

  const pingStyle = useAnimatedStyle(() => ({
    opacity: (1 - ping.value) * 0.75,
    transform: [{ scale: 0.35 + ping.value * 1.05 }],
  }));

  return (
    <PressableScale style={styles.chip} onPress={onPress}>
      <CrystalFill edge={1} core="#0E0E12" />
      <View style={styles.mini}>
        <Reanimated.View pointerEvents="none" style={[styles.miniPing, pingStyle]} />
        <Svg width={MINI} height={MINI} viewBox="0 0 18 18">
          <Defs>
            <SvgLinearGradient id="miniBrand" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={BRAND_A} />
              <Stop offset="1" stopColor={BRAND_B} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx={9} cy={9} r={7.6} stroke="rgba(255,255,255,0.42)" strokeWidth={1} strokeDasharray="2 2.4" fill="none" />
          <Circle cx={9} cy={9} r={4.6} stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} fill="none" />
          <Circle cx={9} cy={9} r={2.1} fill="url(#miniBrand)" />
        </Svg>
      </View>
      <GradientText style={styles.chipNum} colors={gradients.crystal}>{String(km)}</GradientText>
      <Text style={styles.chipUnit}>km</Text>
      <Text style={styles.chipChevron}>{open ? '▲' : '▾'}</Text>
    </PressableScale>
  );
}

// ── Panneau ─────────────────────────────────────────────────────────────────

export function RadiusPanel({
  km,
  presets,
  title,
  onSelect,
}: {
  km: number;
  presets: readonly number[];
  title: string;
  onSelect: (km: number) => void;
}) {
  const reduced = useReducedMotion();
  // Le curseur et le radar bougent dès le toucher, sans attendre la
  // vérification du quota (réseau) qui précède le vrai changement de rayon.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [km]);

  const shown = picked ?? km;
  const found = presets.indexOf(shown);
  const index = found >= 0 ? found : nearestIndex(presets, shown);

  const pick = (v: number) => {
    if (v !== shown) haptics.select();
    setPicked(v);
    onSelect(v);
  };

  return (
    <Reanimated.View entering={reduced ? undefined : FadeInDown.duration(240)} style={styles.panel}>
      {/* Lueur cristal radiale derrière le radar. */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="radiusPanelGlow" cx="78%" cy="38%" r="55%">
            <Stop offset="0" stopColor="#DCE4F0" stopOpacity={0.13} />
            <Stop offset="0.6" stopColor="#DCE4F0" stopOpacity={0.03} />
            <Stop offset="1" stopColor="#DCE4F0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#radiusPanelGlow)" />
      </Svg>

      <View style={styles.panelTop}>
        <View style={styles.headline}>
          <Text style={styles.kicker} numberOfLines={2}>{title}</Text>
          <View style={styles.bigRow}>
            <Reanimated.View key={shown} entering={reduced ? undefined : FadeInDown.duration(220)}>
              <GradientText style={styles.bigNum} colors={gradients.crystal}>{String(shown)}</GradientText>
            </Reanimated.View>
            <Text style={styles.bigUnit}>km</Text>
          </View>
        </View>
        <Radar index={index} count={presets.length} />
      </View>

      <PresetTrack presets={presets} index={index} onPick={pick} />
    </Reanimated.View>
  );
}

// ── Radar ───────────────────────────────────────────────────────────────────

const RADAR = 132;
const C = RADAR / 2;
const R_MIN = 12;
const R_MAX = C - 5;
/** Ouverture du faisceau de balayage, en degrés. */
const SWEEP_DEG = 55;

function ringRadius(i: number, n: number): number {
  return n <= 1 ? R_MAX : R_MIN + ((R_MAX - R_MIN) * i) / (n - 1);
}

function Radar({ index, count }: { index: number; count: number }) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  const wave = useSharedValue(1);
  const r = ringRadius(index, count);

  useEffect(() => {
    if (reduced) return;
    sweep.value = 0;
    sweep.value = withRepeat(withTiming(360, { duration: 3800, easing: Easing.linear }), -1);
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);

  // Une onde de cristal part du centre jusqu'au rayon choisi, à l'ouverture
  // et à chaque nouveau choix.
  useEffect(() => {
    if (reduced) return;
    wave.value = 0;
    wave.value = withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) });
  }, [index, reduced, wave]);

  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value}deg` }] }));
  const waveStyle = useAnimatedStyle(() => ({
    opacity: (1 - wave.value) * 0.9,
    transform: [{ scale: 0.3 + wave.value * 0.85 }],
  }));

  // Faisceau : bord d'attaque à 0° (vers la droite), traîne à -SWEEP_DEG.
  // La rotation (sens horaire) emmène le bord d'attaque en premier.
  const a = (-SWEEP_DEG * Math.PI) / 180;
  const tx = C + r * Math.cos(a);
  const ty = C + r * Math.sin(a);
  const beam = `M ${C} ${C} L ${C + r} ${C} A ${r} ${r} 0 0 0 ${tx} ${ty} Z`;

  return (
    <View style={styles.radar}>
      <Svg width={RADAR} height={RADAR}>
        <Defs>
          <RadialGradient id="radarZone" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
            <Stop offset="0.7" stopColor="#DCE4F0" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#DCE4F0" stopOpacity={0.02} />
          </RadialGradient>
          <SvgLinearGradient id="radarBrand" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND_A} />
            <Stop offset="0.55" stopColor={BRAND_B} />
            <Stop offset="1" stopColor={BRAND_C} />
          </SvgLinearGradient>
        </Defs>

        {/* Réticule */}
        <Line x1={C - R_MAX} y1={C} x2={C + R_MAX} y2={C} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        <Line x1={C} y1={C - R_MAX} x2={C} y2={C + R_MAX} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

        {/* Zone couverte */}
        <Circle cx={C} cy={C} r={r} fill="url(#radarZone)" />

        {/* Anneaux : pleins à l'intérieur du rayon, pointillés au-delà. */}
        {Array.from({ length: count }, (_, i) => (i === index ? null : (
          <Circle
            key={i}
            cx={C}
            cy={C}
            r={ringRadius(i, count)}
            fill="none"
            stroke={i < index ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.11)'}
            strokeWidth={1}
            strokeDasharray={i < index ? undefined : '2 4'}
          />
        )))}

        {/* Anneau choisi : halo puis trait au dégradé de marque. */}
        <Circle cx={C} cy={C} r={r} fill="none" stroke="url(#radarBrand)" strokeWidth={7} strokeOpacity={0.18} />
        <Circle cx={C} cy={C} r={r} fill="none" stroke="url(#radarBrand)" strokeWidth={2} />

        {/* Toi, au centre */}
        <Circle cx={C} cy={C} r={7} fill={BRAND_B} fillOpacity={0.22} />
        <Circle cx={C} cy={C} r={3.6} fill="url(#radarBrand)" />
        <Circle cx={C} cy={C} r={1.4} fill="#FFFFFF" />
      </Svg>

      {!reduced ? (
        <>
          <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sweepStyle]}>
            <Svg width={RADAR} height={RADAR}>
              <Defs>
                <SvgLinearGradient
                  id="radarBeam"
                  gradientUnits="userSpaceOnUse"
                  x1={C + (tx - C) * 0.6}
                  y1={C + (ty - C) * 0.6}
                  x2={C + r * 0.6}
                  y2={C}
                >
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.26} />
                </SvgLinearGradient>
              </Defs>
              <Path d={beam} fill="url(#radarBeam)" />
              <Line x1={C} y1={C} x2={C + r} y2={C} stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
            </Svg>
          </Reanimated.View>
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.wave,
              { width: r * 2, height: r * 2, borderRadius: r, left: C - r, top: C - r },
              waveStyle,
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

// ── Glissière des rayons ────────────────────────────────────────────────────

const TRACK_PAD = 4;
const TRACK_BORDER = 1;

function PresetTrack({
  presets,
  index,
  onPick,
}: {
  presets: readonly number[];
  index: number;
  onPick: (km: number) => void;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  // onLayout donne la largeur bordure comprise ; le curseur (absolu) se place
  // depuis l'intérieur de la bordure, les segments dans le padding.
  const seg = width > 0 ? (width - TRACK_BORDER * 2 - TRACK_PAD * 2) / presets.length : 0;
  const x = useSharedValue(0);
  const placed = useRef(false);
  const dir = I18nManager.isRTL ? -1 : 1;

  useEffect(() => {
    if (!seg) return;
    const target = dir * index * seg;
    // Première mesure : le curseur est posé, pas lancé depuis le début.
    if (!placed.current || reduced) {
      x.value = target;
      placed.current = true;
      return;
    }
    x.value = withSpring(target, motion.spring.snappy);
  }, [index, seg, dir, reduced, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {seg > 0 ? (
        <Reanimated.View pointerEvents="none" style={[styles.thumb, { width: seg }, thumbStyle]}>
          <CrystalFill edge={1} core="#17171F" />
        </Reanimated.View>
      ) : null}
      {presets.map((v, i) => {
        const active = i === index;
        return (
          <Pressable
            key={v}
            style={styles.seg}
            onPress={() => onPick(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${v} km`}
          >
            {active ? (
              <GradientText style={styles.segTextOn} colors={gradients.crystal}>{String(v)}</GradientText>
            ) : (
              <Text style={styles.segText}>{v}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  mini: { width: MINI, height: MINI, alignItems: 'center', justifyContent: 'center', marginEnd: 2 },
  miniPing: {
    position: 'absolute',
    width: MINI,
    height: MINI,
    borderRadius: MINI / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  chipNum: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  chipUnit: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.62)' },
  chipChevron: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginStart: 2 },

  panel: {
    marginHorizontal: spacing.md,
    backgroundColor: 'rgba(14,14,18,0.95)',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.24)',
    borderLeftColor: 'rgba(220,228,240,0.14)',
    borderRightColor: 'rgba(174,187,208,0.10)',
    borderBottomColor: 'rgba(174,187,208,0.07)',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  panelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headline: { flex: 1 },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 },
  bigNum: { fontSize: 52, lineHeight: 58, fontWeight: '900', letterSpacing: -1.5, color: '#FFFFFF' },
  bigUnit: { fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.6)', marginBottom: 9 },

  radar: { width: RADAR, height: RADAR },
  wave: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  track: {
    flexDirection: 'row',
    height: 46,
    padding: TRACK_PAD,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: TRACK_BORDER,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  thumb: {
    position: 'absolute',
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    start: TRACK_PAD,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  segTextOn: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
});
