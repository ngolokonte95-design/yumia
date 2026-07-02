import { UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';

const FALLBACK = { emoji: '📍', labelFr: '', i18nKey: '', key: '' };

/** Retourne le meta d'un univers, avec fallback si l'univers est inconnu (legacy DB). */
export function safeMeta(universe: string) {
  return (UNIVERSE_META as Record<string, typeof FALLBACK>)[universe] ?? FALLBACK;
}

// Emoji spécifique par type de lieu de culte, déduit des tags (types Google).
// Ordre = du plus spécifique au plus générique. Défaut : 🛐 (symbole neutre),
// jamais la mosquée par défaut.
const WORSHIP_EMOJI: Array<[string, string]> = [
  ['mosque', '🕌'],
  ['synagogue', '🕍'],
  ['hindu_temple', '🛕'],
  ['buddhist', '🛕'],
  ['temple', '🛕'],
  ['cathedral', '⛪'],
  ['chapel', '⛪'],
  ['church', '⛪'],
];

/**
 * Emoji d'un lieu, tenant compte du type réel pour les lieux de culte
 * (église ⛪, mosquée 🕌, synagogue 🕍, temple 🛕…) plutôt qu'un emoji unique.
 * Pour les autres univers, retombe sur l'emoji de l'univers.
 */
export function placeEmoji(universe: string, tags?: string[]): string {
  if (universe === 'place_of_worship') {
    const lower = (tags ?? []).map((t) => t.toLowerCase());
    for (const [key, emoji] of WORSHIP_EMOJI) {
      if (lower.some((t) => t.includes(key))) return emoji;
    }
    return '🛐';
  }
  return safeMeta(universe).emoji;
}
