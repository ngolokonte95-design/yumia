/**
 * Réglages de mise en mémoire tampon pour les vidéos verticales courtes
 * (reels, publications, stories) : démarrer vite plutôt que prudemment.
 *
 * Par défaut, iOS attend d'avoir assez de tampon pour ne jamais s'arrêter
 * (`waitsToMinimizeStalling`) et Android vise 20 s d'avance : sur une vidéo
 * de quelques secondes, ces deux prudences ne font que retarder la première
 * image. Une vidéo de fil doit partir dès qu'une seconde est disponible —
 * elle est lue en boucle et sa suite arrive largement à temps.
 */
import type { BufferOptions } from 'expo-video';

export const SHORT_VIDEO_BUFFER: BufferOptions = {
  preferredForwardBufferDuration: 4,
  waitsToMinimizeStalling: false,
  minBufferForPlayback: 1,
  prioritizeTimeOverSizeThreshold: true,
};
