/**
 * Lecteur du radar de pluie, sous la carte météo (18/11, demande de
 * l'utilisateur : le bandeau qui défilait avec un « ⏸ » emoji était à
 * retirer ou à refaire « en beaucoup mieux »).
 *
 * - Bouton lecture/pause rond serti de cristal, pictogrammes dessinés (plus
 *   d'emoji système, gris sur iOS).
 * - Piste de verre : le passé se remplit de cristal, la prévision (s'il y en
 *   a) est un fin trait au dégradé de marque, un repère marque « maintenant ».
 *   Le curseur glisse en continu d'une image à l'autre pendant la lecture.
 * - On fait glisser le doigt sur la piste pour choisir un instant : la
 *   lecture se met en pause sur l'image choisie.
 * - À droite, l'heure en cristal et, dessous, « il y a 40 min »,
 *   « Maintenant » ou « dans 20 min ».
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { CrystalFill, GradientText, PressableScale } from '../ui';
import { gradients } from '../../theme/tokens';
import { formatLocalTime, type RadarFrame } from '../../lib/services/weather';
import { haptics } from '../../lib/useHaptics';

const THUMB = 14;
const TRACK_H = 4;
/** Hauteur de la zone tactile de la piste (bien plus large que le trait). */
const HIT_H = 40;
const INK = '#F4F7FB';

export function RadarTimeline({
  frames,
  index,
  playing,
  stepMs,
  utcOffsetSeconds,
  labels,
  onTogglePlay,
  onScrub,
}: {
  frames: RadarFrame[];
  index: number;
  playing: boolean;
  /** Durée d'une image pendant la lecture : le curseur glisse sur ce temps. */
  stepMs: number;
  utcOffsetSeconds: number;
  /** Textes traduits ; `{n}` est remplacé par le nombre de minutes. */
  labels: { now: string; ago: string; in: string };
  onTogglePlay: () => void;
  onScrub: (index: number) => void;
}) {
  const reduced = useReducedMotion();
  const n = frames.length;
  const frame = frames[index];

  // « Maintenant » = la dernière observation ; après, ce sont des prévisions.
  let nowIdx = n - 1;
  while (nowIdx > 0 && frames[nowIdx]?.forecast) nowIdx--;
  const frac = (i: number) => (n > 1 ? i / (n - 1) : 1);
  const hasForecast = n > 1 && nowIdx < n - 1;

  const [width, setWidth] = useState(0);
  const pos = useSharedValue(frac(index));
  const prevIndex = useRef(index);

  useEffect(() => {
    const target = frac(index);
    const stepForward = index === prevIndex.current + 1;
    prevIndex.current = index;
    // Lecture : glissement continu d'une image à la suivante. Retour au
    // début, choix au doigt ou animations réduites : le curseur s'y pose.
    pos.value = playing && stepForward && !reduced
      ? withTiming(target, { duration: stepMs, easing: Easing.linear })
      : target;
    // frac ne dépend que de n, déjà suivi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, n, playing, stepMs, reduced, pos]);

  const fillStyle = useAnimatedStyle(() => ({ width: pos.value * width }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * width - THUMB / 2 }] }));

  const lastScrub = useRef(-1);
  const scrubAt = (e: GestureResponderEvent) => {
    if (n < 1 || width <= 0) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX, 0), width);
    const i = Math.round((x / width) * (n - 1));
    if (i !== lastScrub.current) {
      lastScrub.current = i;
      haptics.select();
      onScrub(i);
    }
  };

  // Heure relative à la dernière observation (et non à l'horloge du
  // téléphone : la dernière image radar a toujours quelques minutes).
  let status = '';
  if (frame && frames[nowIdx]) {
    const minutes = Math.round((Date.parse(frame.time) - Date.parse(frames[nowIdx].time)) / 60000);
    status = minutes === 0
      ? labels.now
      : (minutes < 0 ? labels.ago : labels.in).replace('{n}', String(Math.abs(minutes)));
  }

  return (
    <View style={styles.row}>
      <PressableScale onPress={onTogglePlay} style={styles.play} scaleTo={0.9} haptic disabled={n < 2}>
        <CrystalFill edge={1.2} core="#14151D" />
        {playing ? (
          <View style={styles.pauseIcon}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        ) : (
          <Svg width={14} height={16} viewBox="0 0 14 16" style={styles.playIcon}>
            <Path d="M2 1.6c0-.9 1-1.4 1.7-.9l9.1 6.4c.6.4.6 1.3 0 1.7L3.7 15.2C3 15.7 2 15.2 2 14.3V1.6z" fill={INK} />
          </Svg>
        )}
      </PressableScale>

      {/* Piste. Les enfants ignorent le toucher : locationX est ainsi
          toujours mesuré depuis le bord de la piste. Sens gauche → droite
          imposé : c'est un axe du temps. */}
      <View
        style={styles.hit}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => n > 1}
        onMoveShouldSetResponder={() => n > 1}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => { lastScrub.current = -1; scrubAt(e); }}
        onResponderMove={scrubAt}
      >
        <View pointerEvents="none" style={styles.track}>
          {hasForecast ? (
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.forecast, { left: `${frac(nowIdx) * 100}%` }]}
            />
          ) : null}
          <Reanimated.View style={[styles.fill, fillStyle]}>
            <LinearGradient
              colors={['rgba(220,228,240,0.55)', 'rgba(255,255,255,0.95)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Reanimated.View>
        </View>
        {hasForecast ? (
          <View pointerEvents="none" style={[styles.nowMark, { left: `${frac(nowIdx) * 100}%` }]} />
        ) : null}
        {n > 0 && width > 0 ? (
          <Reanimated.View pointerEvents="none" style={[styles.thumbWrap, thumbStyle]}>
            <View style={styles.thumbHalo} />
            <View style={styles.thumb} />
          </Reanimated.View>
        ) : null}
      </View>

      <View style={styles.timeCol}>
        <GradientText style={styles.time} colors={gradients.crystal}>
          {frame ? formatLocalTime(frame.time, utcOffsetSeconds) : '--:--'}
        </GradientText>
        <View style={styles.statusRow}>
          {frame?.forecast ? (
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.forecastDot} />
          ) : null}
          <Text style={styles.status} numberOfLines={1}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseIcon: { flexDirection: 'row', gap: 4 },
  pauseBar: { width: 3.5, height: 13, borderRadius: 1.5, backgroundColor: INK },
  // Le triangle est décalé d'un poil vers la droite : centré à l'œil.
  playIcon: { marginStart: 2 },

  hit: { flex: 1, height: HIT_H, justifyContent: 'center', direction: 'ltr' },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  forecast: { position: 'absolute', top: 0, bottom: 0, right: 0, opacity: 0.55 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: TRACK_H / 2, overflow: 'hidden' },
  nowMark: {
    position: 'absolute',
    top: HIT_H / 2 - 7,
    width: 2,
    height: 14,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  thumbWrap: {
    position: 'absolute',
    left: 0,
    top: (HIT_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbHalo: {
    position: 'absolute',
    width: THUMB + 12,
    height: THUMB + 12,
    borderRadius: (THUMB + 12) / 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: INK,
    borderWidth: 2,
    borderColor: 'rgba(174,187,208,0.9)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  timeCol: { minWidth: 62, alignItems: 'flex-end' },
  time: { fontSize: 17, fontWeight: '900', color: INK, fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  forecastDot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
});
