/**
 * Sons d'appel : sonnerie (appel reçu) et tonalité de retour (appel émis).
 *
 * Avant, un appel ne faisait que vibrer : aucun fichier son n'existait. Les
 * deux sons sont générés (aucun droit d'auteur) : assets/sounds/ringtone.wav,
 * mélodie de 3 s, et ringback.wav, 425 Hz 1,5 s / 3,5 s (norme européenne).
 *
 * La sonnerie respecte le mode silencieux d'iOS (seule la vibration reste),
 * comme un vrai téléphone ; la tonalité de retour, elle, s'entend toujours :
 * c'est l'appelant qui l'a déclenchée en lançant l'appel.
 *
 * Ne joue que pendant que l'écran d'appel est ouvert. Un appel reçu app
 * fermée passe par la notification push (son système court) — une vraie
 * sonnerie en arrière-plan demanderait CallKit / ConnectionService.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

type CallSound = 'incoming' | 'outgoing';

const SOURCES: Record<CallSound, number> = {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  incoming: require('../assets/sounds/ringtone.wav'),
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  outgoing: require('../assets/sounds/ringback.wav'),
};

let player: AudioPlayer | null = null;
let current: CallSound | null = null;

export function startCallSound(kind: CallSound): void {
  if (current === kind) return;
  stopCallSound();
  current = kind;
  try {
    // Appel émis : le micro est déjà ouvert par WebRTC. Passer la session en
    // simple lecture couperait l'enregistrement — d'où allowsRecording. Appel
    // reçu : le micro ne s'ouvre qu'au décroché, on peut respecter le silencieux.
    void setAudioModeAsync(
      kind === 'outgoing'
        ? { allowsRecording: true, playsInSilentMode: true }
        : { allowsRecording: false, playsInSilentMode: false },
    ).catch(() => undefined);
    const p = createAudioPlayer(SOURCES[kind]);
    p.loop = true;
    p.volume = kind === 'incoming' ? 1 : 0.6;
    p.play();
    player = p;
  } catch {
    // Best-effort : un son manquant ne doit jamais empêcher l'appel.
    current = null;
  }
}

export function stopCallSound(): void {
  current = null;
  const p = player;
  player = null;
  if (!p) return;
  try { p.pause(); } catch { /* déjà libéré */ }
  try { p.remove(); } catch { /* déjà libéré */ }
}
