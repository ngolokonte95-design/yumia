import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { GlassCard } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  formatLocalTime, moonPhaseEmoji, moonPhaseLabel, type Astro,
} from '../../lib/services/weather';
import { useI18n } from '../../lib/useI18n';

const ARC_W = 260;
const ARC_H = 96;
const PAD = 14;

/**
 * Position sur l'arc pour une progression 0→1, du lever au coucher.
 * L'arc est une demi-ellipse : x avance linéairement, y suit un sinus.
 */
function pointOnArc(t: number) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return {
    x: PAD + clamped * (ARC_W - PAD * 2),
    y: ARC_H - PAD - Math.sin(clamped * Math.PI) * (ARC_H - PAD * 2),
  };
}

/**
 * Course du soleil sur la journée, heures dorées et phase de la lune.
 *
 * Le point lumineux montre où en est la journée en un coup d'œil, et les
 * heures dorées sont mises en avant parce que c'est l'information réellement
 * actionnable pour qui cherche le bon moment pour sortir ou photographier.
 */
export function SunPath({
  astro, utcOffsetSeconds, now = new Date(),
}: {
  astro: Astro;
  utcOffsetSeconds: number;
  now?: Date;
}) {
  const { t, locale } = useI18n();
  const sunrise = new Date(astro.sunrise).getTime();
  const sunset = new Date(astro.sunset).getTime();
  const dayLength = Math.max(sunset - sunrise, 1);
  const progress = (now.getTime() - sunrise) / dayLength;

  const isDaytime = progress >= 0 && progress <= 1;
  const sun = pointOnArc(progress);

  const hours = Math.floor(dayLength / 3_600_000);
  const minutes = Math.round((dayLength % 3_600_000) / 60_000);

  return (
    <GlassCard style={styles.card} rounded={radius.lg}>
      <View style={styles.inner}>
        <Text style={styles.title}>{t('sp_title')}</Text>

        <View style={styles.arcWrap}>
          <Svg width={ARC_W} height={ARC_H}>
            <Defs>
              <SvgGradient id="arc" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#F0A868" stopOpacity="0.9" />
                <Stop offset="0.5" stopColor="#FFD98E" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#E8621A" stopOpacity="0.9" />
              </SvgGradient>
            </Defs>

            {/* Ligne d'horizon */}
            <Path
              d={`M0 ${ARC_H - PAD} H ${ARC_W}`}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
            />

            {/* Arc de la course solaire */}
            <Path
              d={`M ${PAD} ${ARC_H - PAD} Q ${ARC_W / 2} ${-ARC_H + PAD * 3} ${ARC_W - PAD} ${ARC_H - PAD}`}
              stroke="url(#arc)"
              strokeWidth={2.5}
              strokeDasharray="5 5"
              fill="none"
            />

            {isDaytime && (
              <>
                <Circle cx={sun.x} cy={sun.y} r={13} fill="#FFD98E" opacity={0.22} />
                <Circle cx={sun.x} cy={sun.y} r={6} fill="#FFE9B8" />
              </>
            )}
          </Svg>
        </View>

        <View style={styles.times}>
          <View style={styles.timeCol}>
            <Text style={styles.timeLabel}>{t('sp_sunrise')}</Text>
            <Text style={styles.timeValue}>{formatLocalTime(astro.sunrise, utcOffsetSeconds)}</Text>
          </View>
          <View style={styles.timeColCenter}>
            <Text style={styles.timeLabel}>{t('sp_daylength')}</Text>
            <Text style={styles.timeValue}>{t('sp_daylength_value').replace('{h}', String(hours)).replace('{m}', String(minutes))}</Text>
          </View>
          <View style={styles.timeColRight}>
            <Text style={styles.timeLabel}>{t('sp_sunset')}</Text>
            <Text style={styles.timeValue}>{formatLocalTime(astro.sunset, utcOffsetSeconds)}</Text>
          </View>
        </View>

        <View style={styles.golden}>
          <Text style={styles.goldenTitle}>{t('sp_golden_hour')}</Text>
          <View style={styles.goldenRow}>
            <Text style={styles.goldenSlot}>
              {t('sp_morning')} {formatLocalTime(astro.goldenHourMorning.start, utcOffsetSeconds)}
              {' – '}{formatLocalTime(astro.goldenHourMorning.end, utcOffsetSeconds)}
            </Text>
            <Text style={styles.goldenSlot}>
              {t('sp_evening')} {formatLocalTime(astro.goldenHourEvening.start, utcOffsetSeconds)}
              {' – '}{formatLocalTime(astro.goldenHourEvening.end, utcOffsetSeconds)}
            </Text>
          </View>
        </View>

        <View style={styles.moon}>
          <Text style={styles.moonEmoji}>{moonPhaseEmoji(astro.moonPhase)}</Text>
          <View style={styles.moonText}>
            <Text style={styles.moonPhase}>{moonPhaseLabel(astro.moonPhase, locale)}</Text>
            <Text style={styles.moonIllum}>
              {t('sp_moon_illuminated').replace('{pct}', String(Math.round(astro.moonIllumination * 100)))}
            </Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.md },
  inner: { padding: spacing.md, gap: spacing.sm },
  title: { ...typography.label, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' },
  arcWrap: { alignItems: 'center', marginVertical: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  timeCol: { gap: 2, flex: 1 },
  timeColCenter: { gap: 2, flex: 1, alignItems: 'center' },
  timeColRight: { gap: 2, flex: 1, alignItems: 'flex-end' },
  timeLabel: { ...typography.label, color: 'rgba(255,255,255,0.5)' },
  timeValue: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  golden: {
    marginTop: 4, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 4,
  },
  goldenTitle: { ...typography.caption, color: '#FFD98E', fontWeight: '700' },
  goldenRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  goldenSlot: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  moon: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: 4, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  moonEmoji: { fontSize: 28 },
  moonText: { gap: 2 },
  moonPhase: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  moonIllum: { ...typography.caption, color: 'rgba(255,255,255,0.55)' },
});
