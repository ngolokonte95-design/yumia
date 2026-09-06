/**
 * Helpers haptiques YUMIA.
 * Silencieux si l'appareil ne supporte pas les haptics (Android bas de gamme, simulateur).
 */
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<void>) {
  fn().catch(() => {});
}

export const haptics = {
  /** Confirmation douce — sauvegarde, like, vote. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Confirmation standard — visite enregistrée. */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Moment fort — badge débloqué, niveau atteint. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),

  /** Succès — XP gagné, achat confirmé. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** Erreur — tentative invalide. */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),

  /** Sélection — changement d'onglet, chip activé. */
  select: () => safe(() => Haptics.selectionAsync()),

  /**
   * Démarre la vibration répétée d'appel (deux pulsations rapprochées puis
   * pause, en boucle) — tient lieu de sonnerie en l'absence de fichier audio
   * dédié. Idempotent : un seul minuteur actif à la fois. À appeler dès que
   * l'écran d'appel passe en 'calling'/'ringing', et `stopRing()` dès que
   * l'état change (décroché/raccroché/refusé/terminé).
   */
  startRing: () => {
    if (ringTimer) return;
    playRingPulse();
    ringTimer = setInterval(playRingPulse, 1500);
  },

  /** Stoppe la vibration d'appel démarrée par `startRing()`. */
  stopRing: () => {
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  },
};

let ringTimer: ReturnType<typeof setInterval> | null = null;

function playRingPulse() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  setTimeout(() => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)), 200);
}
