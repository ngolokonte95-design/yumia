import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image } from 'expo-image';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '../theme/tokens';

/**
 * Vignette d'une vidéo dans une grille de profil — la vraie première image de
 * la vidéo, comme Instagram (pas de tuile générique).
 *
 * Utilise `expo-video-thumbnails`, PAS `generateThumbnailsAsync` d'expo-video
 * (celui utilisé avant) : ce dernier plantait l'app nativement, sans erreur
 * JS — confirmé en isolant chaque bloc de l'écran profil un par un, un seul
 * post vidéo suffisait à déclencher le crash. `expo-video-thumbnails` est un
 * module dédié, à usage unique par appel (il n'instancie pas de lecteur vidéo
 * persistant comme expo-video), nettement plus léger.
 *
 * Cette API n'a pas d'option de dimension de sortie (contrairement à celle qui
 * plantait) — juste `quality` (compression JPEG). Deux garde-fous conservés
 * de la tentative précédente, toujours utiles :
 *  1. cache module — une même vidéo n'est décodée qu'une fois par session ;
 *  2. file d'attente — au plus `MAX_CONCURRENT` extractions en parallèle.
 */

const MAX_CONCURRENT = 2;
const MAX_CACHED = 40;

const cache = new Map<string, string>();

function remember(uri: string, thumbUri: string) {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(uri, thumbUri);
}

let running = 0;
const waiting: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT) { running += 1; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(() => { running += 1; resolve(); }));
}

function releaseSlot() {
  running -= 1;
  waiting.shift()?.();
}

export function VideoThumb({ uri, style }: { uri: string; style?: ViewStyle }) {
  const cached = cache.get(uri) ?? null;
  const [thumbUri, setThumbUri] = useState<string | null>(cached);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;

    const generate = async () => {
      await acquireSlot();
      try {
        const { uri: t } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 100,
          quality: 0.5,
        });
        if (cancelled) return;
        remember(uri, t);
        setThumbUri(t);
      } catch {
        // Vidéo illisible ou format non supporté : on garde le fond neutre.
      } finally {
        releaseSlot();
      }
    };

    void generate();
    return () => { cancelled = true; };
  }, [uri, cached]);

  if (!thumbUri) return <View style={[style, styles.placeholder]} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Image source={{ uri: thumbUri }} style={style as any} contentFit="cover" />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.surfaceElevated },
});
