import { UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';

const FALLBACK = { emoji: '📍', labelFr: '', i18nKey: '', key: '' };

/** Retourne le meta d'un univers, avec fallback si l'univers est inconnu (legacy DB). */
export function safeMeta(universe: string) {
  return (UNIVERSE_META as Record<string, typeof FALLBACK>)[universe] ?? FALLBACK;
}
