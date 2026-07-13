import { useVideoPlayer, VideoView } from 'expo-video';
import { type ViewStyle } from 'react-native';

/**
 * Lecteur vidéo inline pour le feed. Muet + boucle par défaut (façon Instagram),
 * contrôles natifs au tap. `uri` doit être une URL http(s) accessible.
 */
export function PostVideo({ uri, style }: { uri: string; style?: ViewStyle }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls
    />
  );
}
