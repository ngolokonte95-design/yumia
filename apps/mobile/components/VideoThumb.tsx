import { useEffect, useState } from 'react';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';
import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';

/**
 * Miniature d'une vidéo (grille de profil) : génère une vraie image depuis la
 * vidéo via `generateThumbnailsAsync` (Image ne peut pas décoder un .mp4, et
 * VideoView sans lecture affiche un carré noir — cette API expo-video est le
 * seul moyen fiable d'obtenir une frame statique).
 */
export function VideoThumb({ uri, style }: { uri: string; style?: ViewStyle }) {
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);
  const player = useVideoPlayer(uri);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      try {
        const [t] = await player.generateThumbnailsAsync(0.1);
        if (!cancelled && t) setThumb(t);
      } catch {}
    };
    const sub = player.addListener('sourceLoad', () => { void generate(); });
    void generate();
    return () => { cancelled = true; sub.remove(); };
  }, [player]);

  if (!thumb) return <View style={[style, { backgroundColor: '#111' }]} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Image source={thumb} style={style as any} contentFit="cover" />;
}
