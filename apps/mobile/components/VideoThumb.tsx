import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '../theme/tokens';

/**
 * Vignette d'une vidéo dans une grille de profil.
 *
 * N'extrait PLUS d'image depuis la vidéo. L'implémentation précédente appelait
 * `generateThumbnailsAsync` d'expo-video, ce qui plantait l'application au
 * niveau natif — l'écran disparaissait sans message d'erreur, et il suffisait
 * d'UNE seule vidéo dans la grille pour déclencher le crash (donc pas un
 * problème de mémoire ou de nombre de lecteurs, mais bien cet appel).
 * Diagnostic : en masquant les blocs de l'écran un par un, seule la grille
 * plantait, et la publication concernée est bien une vidéo.
 *
 * On affiche donc une tuile statique, sans aucun module natif. Pour retrouver
 * de vraies miniatures, la solution durable est de les générer côté serveur au
 * moment de la publication et de les stocker sur le Post.
 */
export function VideoThumb({ uri, style }: { uri: string; style?: ViewStyle }) {
  void uri; // conservé dans la signature : les appelants passent l'URL de la vidéo
  return (
    <View style={[style, styles.tile]}>
      <View style={styles.playCircle}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: '#fff', fontSize: 14, marginLeft: 2 },
});
