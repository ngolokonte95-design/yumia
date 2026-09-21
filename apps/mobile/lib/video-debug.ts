/**
 * Surveillance des erreurs de lecteur vidéo.
 *
 * C'est le point de détection de la réinitialisation du service média d'iOS
 * (« Cannot Complete Action ») : après elle, tous les lecteurs de l'app sont
 * des zombies et doivent être recréés — cf. lib/media-epoch.ts. Le journal
 * de diagnostic qui vivait ici (lecteurs vivants, play() sans effet) a rempli
 * son rôle et a été retiré.
 */
import type { VideoPlayer } from 'expo-video';
import { reportPlayerError } from './media-epoch';

/** Journalise les erreurs d'un lecteur et déclenche la reconstruction si besoin ; renvoie le désabonnement. */
export function watchPlayerErrors(player: VideoPlayer, where: string): () => void {
  const sub = player.addListener('statusChange', ({ status, error }) => {
    if (status === 'error') {
      console.warn(`[video] ERREUR ${where} : ${error?.message ?? 'sans message'}`);
      reportPlayerError(error?.message);
    }
  });
  return () => sub.remove();
}
