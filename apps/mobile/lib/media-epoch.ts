/**
 * Reconstruction des lecteurs vidéo après une réinitialisation du service
 * média d'iOS.
 *
 * Observé en prod (journal `[video]`) : au bout d'un moment d'usage, un
 * lecteur remonte « Failed to load the player item: Cannot Complete Action »
 * — le libellé d'`AVErrorMediaServicesWereReset`. Le service média du système
 * a redémarré, et tous les lecteurs existants de l'app sont devenus des
 * zombies : `status` dit encore `readyToPlay`, mais `play()` n'a plus aucun
 * effet. Apple demande aux apps de recréer leurs lecteurs dans ce cas ; sans
 * ça, seul un redémarrage de l'app y remédiait.
 *
 * Mécanisme : un compteur global. Quand l'erreur est détectée, il avance ;
 * chaque lecteur l'inclut dans sa source (`useVideoPlayer` recrée un lecteur
 * natif dès que la source change), donc tous se reconstruisent, pas seulement
 * celui qui a signalé l'erreur.
 */
import { useSyncExternalStore } from 'react';

let epoch = 0;
let lastBumpAt = 0;
const listeners = new Set<() => void>();

// Une réinitialisation invalide tous les lecteurs d'un coup : plusieurs vont
// signaler l'erreur à quelques millisecondes d'écart. Un seul rebond suffit.
const BUMP_COOLDOWN_MS = 3000;

const RESET_PATTERN = /cannot complete action|media services were reset|-11819/i;

/** À appeler avec le message de toute erreur remontée par un lecteur. */
export function reportPlayerError(message: string | undefined): void {
  if (!message || !RESET_PATTERN.test(message)) return;
  const now = Date.now();
  if (now - lastBumpAt < BUMP_COOLDOWN_MS) return;
  lastBumpAt = now;
  epoch += 1;
  console.warn(`[video] service média réinitialisé — reconstruction des lecteurs (époque ${epoch})`);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Numéro d'époque courant ; change après chaque réinitialisation détectée. */
export function useMediaEpoch(): number {
  return useSyncExternalStore(subscribe, () => epoch, () => epoch);
}

/**
 * Source à donner à `useVideoPlayer` : identique à l'URL tant qu'aucune
 * réinitialisation n'a eu lieu, puis enrichie d'un en-tête anodin qui change
 * avec l'époque — ce qui force la création d'un lecteur natif neuf.
 */
export function epochSource(uri: string, currentEpoch: number): string | { uri: string; headers: Record<string, string> } {
  return currentEpoch === 0 ? uri : { uri, headers: { 'X-Media-Epoch': String(currentEpoch) } };
}
