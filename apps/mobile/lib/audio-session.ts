/**
 * Remet la sortie audio en mode LECTURE.
 *
 * Tout ce qui utilise le micro (message vocal, voix off, appel, enregistrement
 * vidéo) bascule la session audio d'iOS en « lecture + enregistrement » : le
 * son des vidéos devient alors très faible, voire inaudible, et le reste
 * jusqu'au redémarrage de l'app. Ces sources-là ne rendent pas toutes la main
 * (WebRTC et la caméra sont hors de notre code), d'où ce filet appelé à
 * l'arrivée sur les écrans qui jouent du son.
 *
 * Best-effort : un échec ne doit jamais empêcher l'écran de s'afficher.
 */
import { setAudioModeAsync } from 'expo-audio';

export function restorePlaybackAudio(): void {
  void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
}
