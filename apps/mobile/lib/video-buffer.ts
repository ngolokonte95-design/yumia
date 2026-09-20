/**
 * Réglages de mise en mémoire tampon pour les vidéos verticales courtes
 * (reels, publications, stories) : partir vite, mais d'une seule traite.
 *
 * Par défaut, Android vise 20 s d'avance avant la première image — beaucoup
 * trop pour une vidéo de quelques secondes qu'on découvre au défilement. Le
 * réglage précédent corrigeait ce travers à l'excès : démarrage dès 1 s
 * chargée et `waitsToMinimizeStalling: false`, c'est-à-dire « pars tout de
 * suite, tant pis si tu t'arrêtes ». La vidéo partait donc, épuisait cette
 * seconde, et se figeait le temps de recharger — l'arrêt d'une seconde juste
 * après le démarrage.
 *
 * On garde donc un démarrage anticipé par rapport aux valeurs d'usine, mais
 * avec de quoi tenir : quelques secondes d'avance suffisent, et le
 * préchargement des vidéos voisines (cf. reels.tsx) absorbe le reste.
 */
import type { BufferOptions } from 'expo-video';

export const SHORT_VIDEO_BUFFER: BufferOptions = {
  /** Avance visée pendant la lecture (iOS). Assez pour traverser un creux réseau. */
  preferredForwardBufferDuration: 10,
  /** Laisser iOS éviter les arrêts : c'est précisément ce qu'on veut ici. */
  waitsToMinimizeStalling: true,
  /** Android : de quoi démarrer sans repartir aussitôt en rechargement. */
  minBufferForPlayback: 2.5,
  /** Privilégier la durée disponible au poids des données. */
  prioritizeTimeOverSizeThreshold: true,
};
