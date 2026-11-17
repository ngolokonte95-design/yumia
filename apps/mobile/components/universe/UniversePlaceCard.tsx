/**
 * Carte photo d'un lieu dans la page d'univers : grande photo plein cadre,
 * voile sombre, nom en grand, pastilles distance / note / horaires, cœur
 * d'enregistrement en verre. Sans photo, le dégradé de l'univers et son icône
 * prennent le relais — jamais de case grise vide.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import { PressableScale } from '../ui';
import { UniverseGlyph } from '../UniverseGlyph';
import { universeGradient } from '../../lib/universeTheme';
import { ratingLabel } from '../../lib/place-rating';
import { haptics } from '../../lib/useHaptics';

export const PLACE_CARD_HEIGHT = 228;

export function UniversePlaceCard({
  name,
  universe,
  photoUrl,
  distance,
  rating,
  city,
  hours,
  closed,
  saved,
  onPress,
  onToggleSave,
}: {
  name: string;
  universe: string;
  photoUrl?: string;
  distance: string;
  rating?: number | null;
  city?: string | null;
  hours?: string | null;
  closed?: boolean;
  /** `undefined` = pas de cœur (visiteur non connecté). */
  saved?: boolean;
  onPress: () => void;
  onToggleSave?: () => void;
}) {
  const grad = universeGradient(universe);
  const stars = ratingLabel(rating);

  return (
    <PressableScale style={[styles.card, { borderColor: `${grad[1]}55` }]} onPress={onPress} scaleTo={0.97}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={photoUrl}
          transition={200}
        />
      ) : (
        <>
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
          <View style={styles.fallbackGlyph}>
            <UniverseGlyph u={universe} size={72} />
          </View>
        </>
      )}

      {/* Voile : haut léger (pastilles lisibles), bas profond (texte). */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.3, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>📍 {distance}</Text>
        </View>
        {saved !== undefined && onToggleSave ? (
          <PressableScale
            style={styles.heart}
            onPress={() => { haptics.light(); onToggleSave(); }}
            scaleTo={0.85}
            hitSlop={8}
          >
            <Text style={styles.heartText}>{saved ? '❤️' : '🤍'}</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.bottom}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.metaRow}>
          {stars ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{stars}</Text>
            </View>
          ) : null}
          {hours ? (
            <View style={[styles.pill, closed ? styles.pillClosed : styles.pillOpen]}>
              <Text style={styles.pillText} numberOfLines={1}>🕐 {hours}</Text>
            </View>
          ) : null}
          {city ? <Text style={styles.city} numberOfLines={1}>{city}</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    height: PLACE_CARD_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  fallbackGlyph: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bottom: { gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderColor: 'rgba(255,255,255,0.20)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    maxWidth: '100%',
  },
  pillOpen: { backgroundColor: `${colors.success}55` },
  pillClosed: { backgroundColor: `${colors.danger}66` },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heart: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heartText: { fontSize: 19 },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  city: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
