import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, Reveal } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import type { CurrentWeather } from '../../lib/services/weather';

type T = (key: TranslationKey) => string;

/** Échelle officielle OMS de l'indice UV. */
function uvLevel(uv: number, t: T): { label: string; color: string; ratio: number } {
  const ratio = Math.min(uv / 11, 1);
  if (uv <= 2) return { label: t('wx_uv_low'), color: '#2BB673', ratio };
  if (uv <= 5) return { label: t('wx_uv_moderate'), color: '#F2B705', ratio };
  if (uv <= 7) return { label: t('wx_uv_high'), color: '#F08A4B', ratio };
  if (uv <= 10) return { label: t('wx_uv_very_high'), color: '#E5484D', ratio };
  return { label: t('wx_uv_extreme'), color: '#8B4FD6', ratio };
}

const DIR_KEYS: TranslationKey[] = ['wx_dir_n', 'wx_dir_ne', 'wx_dir_e', 'wx_dir_se', 'wx_dir_s', 'wx_dir_sw', 'wx_dir_w', 'wx_dir_nw'];

/** Rose des vents à 8 branches. */
function windLabel(degrees: number, t: T): string {
  return t(DIR_KEYS[Math.round(degrees / 45) % 8]);
}

/**
 * Tendance de pression : le niveau de la mer standard est à 1013 hPa. En
 * dessous, l'air est instable (perturbations) ; au-dessus, il est stable
 * (temps calme). C'est l'interprétation utile pour décider d'une sortie.
 */
function pressureHint(hpa: number, t: T): string {
  if (hpa < 1000) return t('wx_pressure_unstable');
  if (hpa < 1013) return t('wx_pressure_variable');
  if (hpa < 1025) return t('wx_pressure_stable');
  return t('wx_pressure_very_stable');
}

function visibilityHint(km: number, t: T): string {
  if (km >= 20) return t('wx_visibility_excellent');
  if (km >= 10) return t('wx_visibility_good');
  if (km >= 4) return t('wx_visibility_moderate');
  if (km >= 1) return t('wx_visibility_reduced');
  return t('wx_visibility_very_low');
}

function Tile({
  icon, label, value, hint, index, children,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  index: number;
  children?: React.ReactNode;
}) {
  return (
    <Reveal index={index} style={styles.tileWrap}>
      <GlassCard rounded={radius.md} style={styles.tile}>
        <View style={styles.tileInner}>
          <Text style={styles.tileLabel}>{icon}  {label}</Text>
          <Text style={styles.tileValue}>{value}</Text>
          {children}
          {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
        </View>
      </GlassCard>
    </Reveal>
  );
}

/** Détail complet des conditions actuelles, en tuiles de verre. */
export function MetricsGrid({ current }: { current: CurrentWeather }) {
  const { t } = useI18n();
  const uv = uvLevel(current.uvIndex, t);

  return (
    <View style={styles.grid}>
      <Tile
        index={0}
        icon="☀️"
        label={t('wx_uv_index')}
        value={String(current.uvIndex)}
        hint={uv.label}
      >
        <View style={styles.uvTrack}>
          <LinearGradient
            colors={['#2BB673', '#F2B705', '#E5484D', '#8B4FD6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.uvCursor, { left: `${uv.ratio * 100}%` }]} />
        </View>
      </Tile>

      <Tile
        index={1}
        icon="💨"
        label={t('wx_wind')}
        value={`${current.windKph} km/h`}
        hint={t('wx_wind_direction').replace('{dir}', windLabel(current.windDirection, t))}
      />

      <Tile
        index={2}
        icon="💧"
        label={t('wx_humidity')}
        value={`${current.humidity} %`}
        hint={current.humidity > 70 ? t('wx_humidity_wet') : current.humidity < 35 ? t('wx_humidity_dry') : t('wx_humidity_comfortable')}
      />

      <Tile
        index={3}
        icon="🌡️"
        label={t('wx_feelslike')}
        value={`${current.feelsLikeC}°`}
        hint={
          current.feelsLikeC > current.tempC ? t('wx_feelslike_warmer')
            : current.feelsLikeC < current.tempC ? t('wx_feelslike_cooler')
            : t('wx_feelslike_matching')
        }
      />

      <Tile
        index={4}
        // Le cyclone évoque directement les systèmes de pression, là où un
        // simple rond ne signifiait rien.
        icon="🌀"
        label={t('wx_pressure')}
        value={`${current.pressureHpa} hPa`}
        hint={pressureHint(current.pressureHpa, t)}
      />

      <Tile
        index={5}
        icon="👁️"
        label={t('wx_visibility')}
        value={`${current.visibilityKm} km`}
        hint={visibilityHint(current.visibilityKm, t)}
      />

      <Tile
        index={6}
        icon="🌧️"
        label={t('wx_precipitation')}
        value={`${current.precipitationMm} mm`}
        hint={t('wx_precipitation_hint')}
      />

      <Tile
        index={7}
        icon="☁️"
        label={t('wx_cloud_cover')}
        value={`${current.cloudCover} %`}
        hint={current.cloudCover > 75 ? t('wx_cloud_covered') : current.cloudCover < 25 ? t('wx_cloud_clear') : t('wx_cloud_partial')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.md - 4, marginTop: spacing.md,
  },
  tileWrap: { width: '50%', padding: 4 },
  tile: { minHeight: 108 },
  tileInner: { padding: spacing.md, gap: 4 },
  tileLabel: {
    ...typography.label, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase',
  },
  tileValue: { ...typography.title, color: colors.textPrimary },
  tileHint: { ...typography.caption, color: 'rgba(255,255,255,0.55)' },
  uvTrack: {
    height: 4, borderRadius: 2, marginVertical: 4,
    overflow: 'hidden', justifyContent: 'center',
  },
  uvCursor: {
    position: 'absolute', width: 3, height: 10, borderRadius: 2,
    backgroundColor: '#fff', marginLeft: -1.5,
  },
});
