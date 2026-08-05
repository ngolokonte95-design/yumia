import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, UrlTile } from 'react-native-maps';
import { GlassCard, PressableScale } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getRadarProvider, type RadarFrame } from '../../lib/services/weather/radar';
import { formatLocalTime, getWeatherProvider } from '../../lib/services/weather';
import type { AirGridPoint, Coordinates } from '../../lib/services/weather';

type Layer = 'rain' | 'air';

/** Durée d'affichage d'une frame radar pendant l'animation. */
const FRAME_MS = 650;

/** Emprise de la grille de qualité de l'air, en degrés autour du centre. */
const AIR_SPAN = 0.6;
/** Côté de la grille — 5×5 = 25 points, soit une seule requête. */
const AIR_GRID = 5;

const AIR_COLORS: Record<AirGridPoint['level'], string> = {
  good: '#2BB673',
  fair: '#A8CF45',
  moderate: '#F2B705',
  poor: '#E5484D',
  very_poor: '#8B4FD6',
};

/**
 * Cartes météo : radar de précipitations animé et qualité de l'air.
 *
 * Les deux vivent dans une seule carte avec un sélecteur, plutôt que deux
 * cartes empilées : c'est plus lisible, et surtout ça n'instancie qu'une seule
 * MapView — chacune coûte cher en mémoire et en batterie.
 */
export function WeatherMaps({
  center, utcOffsetSeconds,
}: {
  center: Coordinates;
  /** Décalage du lieu observé — les heures radar s'affichent à son heure. */
  utcOffsetSeconds: number;
}) {
  const [layer, setLayer] = useState<Layer>('rain');
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [airGrid, setAirGrid] = useState<AirGridPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Chargement des données ────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      const provider = getWeatherProvider();
      const [radar, air] = await Promise.allSettled([
        getRadarProvider().fetchFrames(controller.signal),
        provider.fetchAirQualityGrid?.(center, AIR_SPAN, AIR_GRID, controller.signal)
          ?? Promise.resolve([]),
      ]);

      if (controller.signal.aborted) return;

      if (radar.status === 'fulfilled' && radar.value.length > 0) {
        setFrames(radar.value);
        // Démarre sur la frame la plus récente plutôt qu'au début de l'historique.
        setFrameIndex(radar.value.length - 1);
      }
      if (air.status === 'fulfilled') setAirGrid(air.value);
      setLoading(false);
    })();

    return () => controller.abort();
  }, [center]);

  // ── Animation du radar ────────────────────────────────────────────────────
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // On n'anime que la couche visible : laisser tourner en arrière-plan
    // rechargerait des tuiles pour rien.
    if (layer !== 'rain' || !playing || frames.length < 2) return;

    timer.current = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, FRAME_MS);

    return () => { if (timer.current) clearInterval(timer.current); };
  }, [layer, playing, frames.length]);

  const frame = frames[frameIndex];

  return (
    <GlassCard style={styles.card} rounded={radius.lg}>
      <View style={styles.header}>
        <Text style={styles.title}>Cartes</Text>
        <View style={styles.segments}>
          {(['rain', 'air'] as Layer[]).map((l) => (
            <PressableScale
              key={l}
              scaleTo={0.94}
              onPress={() => setLayer(l)}
              style={[styles.segment, layer === l && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, layer === l && styles.segmentTextActive]}>
                {l === 'rain' ? '🌧️ Pluie' : '🍃 Air'}
              </Text>
            </PressableScale>
          ))}
        </View>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: center.lat,
            longitude: center.lng,
            // Le radar se lit à l'échelle régionale ; la qualité de l'air
            // (résolution ~11 km) demande une emprise encore plus large.
            latitudeDelta: layer === 'rain' ? 3.2 : 1.8,
            longitudeDelta: layer === 'rain' ? 3.2 : 1.8,
          }}
          showsUserLocation
          toolbarEnabled={false}
          // Sans ça, Apple Maps s'affiche en thème clair : le vert vif jure
          // avec toute l'interface sombre. iOS uniquement — sur Android,
          // Google Maps demanderait un `customMapStyle`.
          userInterfaceStyle="dark"
        >
          {layer === 'rain' && frame && (
            <UrlTile
              // La clé force le remplacement de la couche à chaque frame :
              // sans elle, react-native-maps garde les tuiles précédentes.
              key={frame.tileUrlTemplate}
              urlTemplate={frame.tileUrlTemplate}
              zIndex={1}
              maximumZ={10}
              tileSize={256}
              opacity={0.75}
            />
          )}

          {layer === 'air' && airGrid.map((p) => (
            <Circle
              key={`${p.lat},${p.lng}`}
              center={{ latitude: p.lat, longitude: p.lng }}
              // ~7 km : les disques se touchent sans se recouvrir à cette grille.
              radius={7000}
              fillColor={`${AIR_COLORS[p.level]}55`}
              strokeColor={`${AIR_COLORS[p.level]}AA`}
              strokeWidth={1}
            />
          ))}

          {layer === 'air' && (
            <Marker coordinate={{ latitude: center.lat, longitude: center.lng }} />
          )}
        </MapView>

        {loading && (
          <View style={styles.mapOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>

      {/* Pied : timeline radar, ou légende de qualité de l'air */}
      {layer === 'rain' ? (
        <View style={styles.footer}>
          <PressableScale onPress={() => setPlaying((p) => !p)} hitSlop={10}>
            <Text style={styles.play}>{playing ? '⏸' : '▶'}</Text>
          </PressableScale>

          <View style={styles.timeline}>
            {frames.map((f, i) => (
              <View
                key={f.time}
                style={[
                  styles.tick,
                  f.forecast && styles.tickForecast,
                  i === frameIndex && styles.tickActive,
                ]}
              />
            ))}
          </View>

          <Text style={styles.frameTime}>
            {frame ? formatLocalTime(frame.time, utcOffsetSeconds) : '--:--'}
            {frame?.forecast ? ' ⏭' : ''}
          </Text>
        </View>
      ) : (
        <View style={styles.legend}>
          {(Object.keys(AIR_COLORS) as AirGridPoint['level'][]).map((lvl) => (
            <View key={lvl} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: AIR_COLORS[lvl] }]} />
              <Text style={styles.legendText}>
                {lvl === 'good' ? 'Bonne'
                  : lvl === 'fair' ? 'Correcte'
                  : lvl === 'moderate' ? 'Moyenne'
                  : lvl === 'poor' ? 'Mauvaise' : 'Très mauv.'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.attribution}>
        {layer === 'rain' ? 'Radar RainViewer' : 'Qualité de l\'air Open-Meteo'}
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginTop: spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.label, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' },
  segments: {
    flexDirection: 'row', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill, padding: 3,
  },
  segment: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  segmentTextActive: { color: '#fff', fontWeight: '700' },

  mapWrap: { height: 240, marginHorizontal: spacing.sm, borderRadius: radius.md, overflow: 'hidden' },
  map: { flex: 1 },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,14,18,0.35)',
  },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
  },
  play: { fontSize: 18, color: '#fff', width: 24 },
  timeline: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tick: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  // Les frames de prévision se distinguent des observations passées.
  tickForecast: { backgroundColor: 'rgba(232,98,26,0.35)' },
  tickActive: { backgroundColor: '#fff', height: 6 },
  frameTime: { ...typography.caption, color: '#fff', width: 52, textAlign: 'right' },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.label, color: 'rgba(255,255,255,0.6)' },

  attribution: {
    ...typography.label, color: 'rgba(255,255,255,0.35)',
    padding: spacing.md, paddingTop: spacing.sm,
  },
});
