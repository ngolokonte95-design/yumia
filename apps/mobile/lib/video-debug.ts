/**
 * Journalisation des lecteurs vidéo, pour diagnostiquer un symptôme récurrent
 * sur iPhone : au bout d'un moment d'usage, plus aucune vidéo ne démarre,
 * l'appui sur lecture est ignoré, et seul un redémarrage de l'app y remédie.
 *
 * Trois questions que le journal doit trancher, le jour où ça casse :
 *   1. Combien de lecteurs natifs sont vivants à ce moment-là ? (pool épuisé)
 *   2. Un lecteur a-t-il remonté une erreur, et laquelle ? (source, décodeur,
 *      session audio…)
 *   3. Un `play()` a-t-il été émis sans effet ? (ordre ignoré en silence)
 *
 * Tout passe par `console.warn` : visible dans Metro, sans dépendance. À
 * retirer une fois la cause trouvée.
 */
import type { VideoPlayer } from 'expo-video';

let alive = 0;

/** À appeler au montage d'un composant qui possède un lecteur ; renvoie le démontage. */
export function trackPlayer(where: string): () => void {
  alive += 1;
  console.warn(`[video] +1 ${where} → ${alive} lecteur(s) vivant(s)`);
  return () => {
    alive -= 1;
    console.warn(`[video] -1 ${where} → ${alive} lecteur(s) vivant(s)`);
  };
}

/** Journalise les erreurs d'un lecteur ; renvoie le désabonnement. */
export function watchPlayerErrors(player: VideoPlayer, where: string): () => void {
  const sub = player.addListener('statusChange', ({ status, error }) => {
    if (status === 'error') {
      console.warn(`[video] ERREUR ${where} : ${error?.message ?? 'sans message'}`);
    }
  });
  return () => sub.remove();
}

/**
 * Vérifie qu'un `play()` a pris effet : 300 ms plus tard, le lecteur doit
 * être en lecture. Sinon, on journalise son état — c'est LE cas qui nous
 * intéresse, un ordre ignoré sans erreur.
 */
export function assertPlays(player: VideoPlayer, where: string): void {
  setTimeout(() => {
    try {
      if (!player.playing) {
        console.warn(
          `[video] play() SANS EFFET ${where} — status=${player.status} `
          + `playing=${player.playing} muted=${player.muted} `
          + `t=${player.currentTime.toFixed(2)} dur=${player.duration.toFixed(2)}`,
        );
      }
    } catch (err) {
      console.warn(`[video] lecteur injoignable ${where} : ${(err as Error).message}`);
    }
  }, 300);
}
