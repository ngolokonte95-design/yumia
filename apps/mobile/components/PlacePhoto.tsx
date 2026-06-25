import { Image, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/tokens';

interface Props {
  /** Photos du lieu ; la première sert d'image principale. */
  photoUrls?: string[];
  /** Emoji d'univers affiché en secours si aucune photo. */
  emoji: string;
  /** Taille de l'emoji de secours. */
  emojiSize?: number;
  /** Voile sombre par-dessus la photo (garde un texte superposé lisible). */
  scrim?: boolean;
}

/**
 * Photo de lieu en remplissage du parent (qui doit être positionné, dimensionné
 * et `overflow:hidden`). Affiche la vraie photo si disponible, sinon un emoji
 * d'univers atténué. Centralise le rendu image (cartes Home, feed For You…) —
 * fini les « logos » emoji quand une vraie photo existe.
 */
export function PlacePhoto({ photoUrls, emoji, emojiSize = 56, scrim = false }: Props) {
  const uri = photoUrls?.[0];

  if (!uri) {
    return (
      <View style={styles.fallback}>
        <Text style={{ fontSize: emojiSize, opacity: 0.5 }}>{emoji}</Text>
      </View>
    );
  }

  return (
    <>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {scrim ? <View style={[StyleSheet.absoluteFill, styles.scrim]} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  scrim: { backgroundColor: 'rgba(0,0,0,0.32)' },
});
