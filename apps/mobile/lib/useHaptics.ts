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
};
