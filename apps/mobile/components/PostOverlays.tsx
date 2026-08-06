import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PostOverlay } from '../lib/feed-api';

/**
 * Recompose le texte et les dessins superposés à une vidéo, à la LECTURE.
 *
 * Rien n'est gravé dans le fichier vidéo : les overlays sont des données
 * (position en %, tracé SVG…) rejouées par ce composant partout où le post
 * s'affiche — feed, détail, reels. Même principe que les stickers de Story.
 *
 * `pointerEvents="none"` : ce n'est qu'un rendu, jamais interactif en dehors
 * de l'éditeur de publication.
 */
export function PostOverlays({ overlays }: { overlays?: PostOverlay[] | null }) {
  if (!overlays?.length) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Un seul Svg pleine taille pour tous les tracés : les coordonnées de
          chemin sont exprimées en % (viewBox 0 0 100 100), donc indépendantes
          de la résolution d'affichage réelle. */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        {overlays
          .filter((o): o is Extract<PostOverlay, { kind: 'draw' }> => o.kind === 'draw')
          .map((o) => (
            <Path
              key={o.id}
              d={o.path}
              stroke={o.color}
              strokeWidth={o.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
      </Svg>

      {overlays
        .filter((o): o is Extract<PostOverlay, { kind: 'text' }> => o.kind === 'text')
        .map((o) => (
          <Text
            key={o.id}
            style={[
              styles.text,
              {
                left: `${o.x}%`,
                top: `${o.y}%`,
                color: o.color,
                fontSize: o.fontSize,
                // Pourcentages plutôt que des points fixes : sans ça, le
                // recentrage serait faux pour tout texte dont la taille
                // s'écarte de l'hypothèse d'un décalage de 50pt.
                transform: [
                  { translateX: '-50%' }, { translateY: '-50%' },
                  { rotate: `${o.rotation ?? 0}deg` },
                ] as never,
              },
            ]}
          >
            {o.text}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
