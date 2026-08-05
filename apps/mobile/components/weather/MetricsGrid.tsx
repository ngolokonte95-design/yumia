import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, Reveal } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { CurrentWeather } from '../../lib/services/weather';

/** Échelle officielle OMS de l'indice UV. */
function uvLevel(uv: number): { label: string; color: string; ratio: number } {
  const ratio = Math.min(uv / 11, 1);
  if (uv <= 2) return { label: 'Faible', color: '#2BB673', ratio };
  if (uv <= 5) return { label: 'Modéré', color: '#F2B705', ratio };
  if (uv <= 7) return { label: 'Élevé', color: '#F08A4B', ratio };
  if (uv <= 10) return { label: 'Très élevé', color: '#E5484D', ratio };
  return { label: 'Extrême', color: '#8B4FD6', ratio };
}

/** Rose des vents à 8 branches. */
function windLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(degrees / 45) % 8];
}

/**
 * Tendance de pression : le niveau de la mer standard est à 1013 hPa. En
 * dessous, l'air est instable (perturbations) ; au-dessus, il est stable
 * (temps calme). C'est l'interprétation utile pour décider d'une sortie.
 */
function pressureHint(hpa: number): string {
  if (hpa < 1000) return 'Temps instable';
  if (hpa < 1013) return 'Tendance variable';
  if (hpa < 1025) return 'Temps stable';
  return 'Très stable';
}

function visibilityHint(km: number): string {
  if (km >= 20) return 'Excellente';
  if (km >= 10) return 'Bonne';
  if (km >= 4) return 'Moyenne';
  if (km >= 1) return 'Réduite';
  return 'Très faible';
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
  const uv = uvLevel(current.uvIndex);

  return (
    <View style={styles.grid}>
      <Tile
        index={0}
        icon="☀️"
        label="Indice UV"
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
        label="Vent"
        value={`${current.windKph} km/h`}
        hint={`Direction ${windLabel(current.windDirection)}`}
      />

      <Tile
        index={2}
        icon="💧"
        label="Humidité"
        value={`${current.humidity} %`}
        hint={current.humidity > 70 ? 'Air humide' : current.humidity < 35 ? 'Air sec' : 'Confortable'}
      />

      <Tile
        index={3}
        icon="🌡️"
        label="Ressenti"
        value={`${current.feelsLikeC}°`}
        hint={
          current.feelsLikeC > current.tempC ? 'Plus chaud qu\'annoncé'
            : current.feelsLikeC < current.tempC ? 'Plus frais qu\'annoncé'
            : 'Conforme'
        }
      />

      <Tile
        index={4}
        icon="🔵"
        label="Pression"
        value={`${current.pressureHpa} hPa`}
        hint={pressureHint(current.pressureHpa)}
      />

      <Tile
        index={5}
        icon="👁️"
        label="Visibilité"
        value={`${current.visibilityKm} km`}
        hint={visibilityHint(current.visibilityKm)}
      />

      <Tile
        index={6}
        icon="🌧️"
        label="Précipitations"
        value={`${current.precipitationMm} mm`}
        hint="Sur la dernière heure"
      />

      <Tile
        index={7}
        icon="☁️"
        label="Nébulosité"
        value={`${current.cloudCover} %`}
        hint={current.cloudCover > 75 ? 'Ciel couvert' : current.cloudCover < 25 ? 'Ciel dégagé' : 'Passages nuageux'}
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
