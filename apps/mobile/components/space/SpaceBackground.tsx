/**
 * Fond spatial de l'Accueil (17/11/2026, demande de l'utilisateur : « un vrai
 * système solaire », noir profond, étoiles qui scintillent, étoiles filantes).
 *
 * Couches, de l'arrière vers l'avant :
 *  1. noir spatial uni (aucun dégradé linéaire : ils dessinaient des « barres
 *     grises ») ;
 *  2. deux nébuleuses très discrètes, en dégradé RADIAL (SVG) : des halos qui
 *     s'éteignent en cercle, sans bord ni bande ;
 *  3. champ d'étoiles : une poussière fixe + six groupes qui scintillent
 *     chacun à son rythme (six valeurs animées pour ~70 étoiles, pas une par
 *     étoile : léger même sur un Android modeste), dont quelques étoiles
 *     brillantes à aigrettes ;
 *  4. système solaire : soleil rayonnant, orbites en perspective, planètes qui
 *     tournent lentement (une avec anneau) ;
 *  5. étoiles filantes, à intervalles aléatoires.
 *
 * `active = false` (onglet quitté) : toutes les boucles s'arrêtent.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('screen');

/** Noir spatial : plus profond que le fond de l'app, à peine bleuté. */
export const SPACE_BLACK = '#03030A';

// ── Hasard reproductible (positions stables d'un rendu à l'autre) ───────────

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type Star = { x: number; y: number; size: number; color: string };

const STAR_TINTS = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#CFE0FF', '#FFE9C7'];

function makeStars(count: number, seed: number, minSize: number, maxSize: number): Star[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({
    x: r() * W,
    y: r() * H,
    size: minSize + r() * (maxSize - minSize),
    color: STAR_TINTS[Math.floor(r() * STAR_TINTS.length)],
  }));
}

// ── Boucle utilitaire : démarre/arrête une animation selon `active` ─────────

function useLoop(value: SharedValue<number>, active: boolean, start: () => number, reset = 0) {
  useEffect(() => {
    if (!active) {
      cancelAnimation(value);
      return;
    }
    value.value = start();
    return () => {
      cancelAnimation(value);
      value.value = reset;
    };
    // `start` est recréée à chaque rendu mais décrit toujours la même boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, value]);
}

// ── Étoiles ──────────────────────────────────────────────────────────────────

function StarDot({ s }: { s: Star }) {
  return (
    <View
      style={{
        position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size,
        borderRadius: s.size, backgroundColor: s.color,
      }}
    />
  );
}

/** Étoile brillante à aigrettes (croix de lumière). */
function BrightStar({ s }: { s: Star }) {
  const len = s.size * 7;
  return (
    <View style={{ position: 'absolute', left: s.x - len / 2, top: s.y - len / 2, width: len, height: len }}>
      <View style={[styles.spikeH, { top: len / 2 - 0.5, width: len }]} />
      <View style={[styles.spikeV, { left: len / 2 - 0.5, height: len }]} />
      <View
        style={{
          position: 'absolute', left: len / 2 - s.size, top: len / 2 - s.size,
          width: s.size * 2, height: s.size * 2, borderRadius: s.size * 2,
          backgroundColor: 'rgba(255,255,255,0.25)',
        }}
      />
      <View
        style={{
          position: 'absolute', left: len / 2 - s.size / 2, top: len / 2 - s.size / 2,
          width: s.size, height: s.size, borderRadius: s.size, backgroundColor: '#fff',
        }}
      />
    </View>
  );
}

/** Un groupe d'étoiles qui scintille d'un seul souffle. */
function TwinkleGroup({ stars, bright, active, duration, delay, low }: {
  stars: Star[];
  bright?: boolean;
  active: boolean;
  duration: number;
  delay: number;
  low: number;
}) {
  const o = useSharedValue(1);
  useLoop(o, active, () => withDelay(delay, withRepeat(
    withSequence(
      withTiming(low, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
    ),
    -1,
  )), 1);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {stars.map((s, i) => (bright ? <BrightStar key={i} s={s} /> : <StarDot key={i} s={s} />))}
    </Animated.View>
  );
}

// ── Étoiles filantes ─────────────────────────────────────────────────────────

const TRAIL = 150;

function ShootingStar({ active, firstDelay }: { active: boolean; firstDelay: number }) {
  const p = useSharedValue(0);
  const geo = useSharedValue({ x: W * 0.7, y: H * 0.1, angle: 0.55 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    let alive = true;
    const shoot = (wait: number) => {
      timer.current = setTimeout(() => {
        if (!alive) return;
        // Départ en haut, trajectoire descendante vers la gauche, angle variable.
        geo.value = {
          x: W * (0.35 + Math.random() * 0.75),
          y: H * (0.02 + Math.random() * 0.4),
          angle: 0.42 + Math.random() * 0.35,
        };
        p.value = 0;
        p.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) });
        shoot(5200 + Math.random() * 7000);
      }, wait);
    };
    shoot(firstDelay);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      cancelAnimation(p);
    };
  }, [active, firstDelay, p, geo]);

  const style = useAnimatedStyle(() => {
    const { x, y, angle } = geo.value;
    const dist = W * 0.75 * p.value;
    const opacity = p.value < 0.15 ? p.value / 0.15 : p.value > 0.7 ? Math.max(0, (1 - p.value) / 0.3) : 1;
    return {
      opacity: p.value === 0 ? 0 : opacity,
      transform: [
        { translateX: x - Math.cos(angle) * dist },
        { translateY: y + Math.sin(angle) * dist },
        // La traînée (vers +x dans la vue) pointe vers l'arrière de la
        // trajectoire, c.-à-d. vers le haut à droite : (cos a, -sin a).
        { rotate: `${-angle}rad` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.shooting, style]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(255,255,255,0.95)', 'rgba(200,215,255,0.35)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.trail}
      />
      <View style={styles.head} />
    </Animated.View>
  );
}

// ── Système solaire ──────────────────────────────────────────────────────────

/** Centre du soleil : à droite, au tiers bas — les orbites traversent l'écran. */
const SUN = { x: W * 0.86, y: H * 0.64 };
/** Écrasement vertical des orbites : effet de perspective. */
const TILT = 0.34;

type Planet = {
  radius: number;
  size: number;
  color: string;
  shade: string;
  period: number;
  phase: number;
  ring?: boolean;
};

const PLANETS: Planet[] = [
  { radius: W * 0.2, size: 7, color: '#C9B8A6', shade: '#5B5048', period: 38_000, phase: 0.6 },
  { radius: W * 0.36, size: 12, color: '#6FA8FF', shade: '#1D3D78', period: 64_000, phase: 2.4 },
  { radius: W * 0.56, size: 10, color: '#F08A4B', shade: '#6E2C0E', period: 96_000, phase: 4.1 },
  { radius: W * 0.82, size: 18, color: '#E6C79C', shade: '#6B5333', period: 150_000, phase: 3.2, ring: true },
];

function OrbitingPlanet({ p, active }: { p: Planet; active: boolean }) {
  const a = useSharedValue(p.phase);
  useLoop(a, active, () => withRepeat(
    withTiming(p.phase + Math.PI * 2, { duration: p.period, easing: Easing.linear }),
    -1,
  ), p.phase);

  const style = useAnimatedStyle(() => {
    const x = SUN.x + Math.cos(a.value) * p.radius;
    const y = SUN.y + Math.sin(a.value) * p.radius * TILT;
    // Derrière le soleil (moitié haute de l'orbite) : plus petite et plus sombre.
    const depth = 0.82 + 0.18 * Math.sin(a.value);
    return {
      opacity: 0.55 + 0.45 * depth,
      transform: [
        { translateX: x - p.size },
        { translateY: y - p.size },
        { scale: depth },
      ],
    };
  });

  const d = p.size * 2;
  return (
    <Animated.View style={[styles.planetBox, { width: d, height: d }, style]} pointerEvents="none">
      {p.ring ? <View style={[styles.ring, { width: d * 2.1, height: d * 0.62, left: -d * 0.55, top: d * 0.19 }]} /> : null}
      <View style={{ width: p.size, height: p.size, borderRadius: p.size, overflow: 'hidden', backgroundColor: p.color, left: p.size / 2, top: p.size / 2 }}>
        {/* Face non éclairée (le soleil est à droite) : croissant d'ombre. */}
        <View style={{ position: 'absolute', left: -p.size * 0.35, top: -p.size * 0.1, width: p.size * 1.05, height: p.size * 1.2, borderRadius: p.size, backgroundColor: p.shade, opacity: 0.85 }} />
      </View>
    </Animated.View>
  );
}

function SolarSystem({ active }: { active: boolean }) {
  // Le soleil « respire » lentement.
  const pulse = useSharedValue(0);
  useLoop(pulse, active, () => withRepeat(
    withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
    -1,
    true,
  ));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  const G = 260; // diamètre du halo
  return (
    <>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {PLANETS.map((p, i) => (
          <Ellipse
            key={i}
            cx={SUN.x}
            cy={SUN.y}
            rx={p.radius}
            ry={p.radius * TILT}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>

      <Animated.View
        style={[{ position: 'absolute', left: SUN.x - G / 2, top: SUN.y - G / 2, width: G, height: G }, glowStyle]}
        pointerEvents="none"
      >
        <Svg width={G} height={G}>
          <Defs>
            <RadialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFF3D6" stopOpacity="1" />
              <Stop offset="0.12" stopColor="#FFD08A" stopOpacity="0.95" />
              <Stop offset="0.28" stopColor="#F08A4B" stopOpacity="0.35" />
              <Stop offset="0.6" stopColor="#E8621A" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#E8621A" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={G / 2} cy={G / 2} r={G / 2} fill="url(#sunGlow)" />
        </Svg>
      </Animated.View>

      {PLANETS.map((p, i) => <OrbitingPlanet key={i} p={p} active={active} />)}
    </>
  );
}

// ── Nébuleuses ───────────────────────────────────────────────────────────────

function Nebulae() {
  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="nebViolet" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#5C4ECC" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#5C4ECC" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="nebRose" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#8B4FD6" stopOpacity="0.14" />
          <Stop offset="1" stopColor="#8B4FD6" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={W * 0.12} cy={H * 0.2} rx={W * 0.7} ry={H * 0.22} fill="url(#nebViolet)" />
      <Ellipse cx={W * 0.3} cy={H * 0.9} rx={W * 0.6} ry={H * 0.18} fill="url(#nebRose)" />
    </Svg>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────

export function SpaceBackground({ active }: { active: boolean }) {
  const dust = useMemo(() => makeStars(70, 5, 0.6, 1.3), []);
  const groups = useMemo(
    () => Array.from({ length: 6 }, (_, i) => makeStars(11, 101 + i * 17, 1.2, 2.6)),
    [],
  );
  const bright = useMemo(() => makeStars(7, 977, 1.8, 2.6), []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SPACE_BLACK }]} pointerEvents="none">
      <Nebulae />

      {/* Poussière d'étoiles fixe, très discrète. */}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}>
        {dust.map((s, i) => <StarDot key={i} s={s} />)}
      </View>

      {groups.map((stars, i) => (
        <TwinkleGroup
          key={i}
          stars={stars}
          active={active}
          duration={1300 + i * 380}
          delay={i * 420}
          low={0.18}
        />
      ))}
      <TwinkleGroup stars={bright} bright active={active} duration={2100} delay={300} low={0.35} />

      <SolarSystem active={active} />

      <ShootingStar active={active} firstDelay={1800} />
      <ShootingStar active={active} firstDelay={6500} />
    </View>
  );
}

const styles = StyleSheet.create({
  spikeH: { position: 'absolute', left: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  spikeV: { position: 'absolute', top: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  shooting: {
    position: 'absolute', left: 0, top: 0, width: TRAIL, height: 3,
    flexDirection: 'row', alignItems: 'center',
  },
  trail: { position: 'absolute', left: 0, top: 0.5, width: TRAIL, height: 2, borderRadius: 1 },
  head: {
    position: 'absolute', left: -2, top: -1, width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#fff',
    shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  planetBox: { position: 'absolute', left: 0, top: 0 },
  ring: {
    position: 'absolute', borderRadius: 999, borderWidth: 1.5,
    borderColor: 'rgba(230,199,156,0.75)', transform: [{ rotate: '-12deg' }],
  },
});
