/** Métadonnées visuelles par mood d'itinéraire — partagées entre l'écran de
 * génération et celui de consultation des itinéraires enregistrés. */
export type Mood = 'date' | 'amis' | 'famille' | 'solo' | 'touriste';

export const MOOD_META: Record<Mood, { emoji: string; label: string; color: string; sub: string }> = {
  date: {
    emoji: '❤️', label: 'Date romantique', color: '#E8385A',
    sub: 'Une soirée inoubliable pour deux',
  },
  famille: {
    emoji: '👨‍👩‍👧', label: 'Sortie famille', color: '#FF8C00',
    sub: 'Des souvenirs pour toute la famille',
  },
  touriste: {
    emoji: '✈️', label: 'Mode Voyage', color: '#0077CC',
    sub: 'Découvre la ville comme un local',
  },
  amis: {
    emoji: '👫', label: 'Sortie entre amis', color: '#6C3FE8',
    sub: 'Une journée mémorable en groupe',
  },
  solo: {
    emoji: '🧘', label: 'Exploration solo', color: '#2AA876',
    sub: 'À ton rythme, à ta façon',
  },
};

export const MOODS: Mood[] = ['date', 'amis', 'famille', 'solo', 'touriste'];

export function safeMoodMeta(mood: string) {
  return (MOOD_META as Record<string, typeof MOOD_META.amis>)[mood] ?? MOOD_META.amis;
}
