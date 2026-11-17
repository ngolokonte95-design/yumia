/**
 * Options du générateur d'itinéraire (durées, budgets), partagées entre
 * l'écran de génération et le détail d'un itinéraire enregistré — ce dernier
 * réaffiche le budget choisi dans son résumé.
 */

export type Duration = 'soirée' | 'journée' | 'demi-journée' | 'weekend' | 'semaine';
export type Budget = 'économique' | 'moyen' | 'premium';

export const DURATIONS: Array<{ key: Duration; labelKey: string; emoji: string }> = [
  { key: 'demi-journée', labelKey: 'itin_duration_halfday', emoji: '🌤️' },
  { key: 'soirée', labelKey: 'itin_duration_evening', emoji: '🌆' },
  { key: 'journée', labelKey: 'itin_duration_fullday', emoji: '☀️' },
  { key: 'weekend', labelKey: 'itin_duration_weekend', emoji: '🗓️' },
];

// "Semaine" n'a de sens que pour le mode Voyage — un itinéraire d'une
// semaine pour un date ou une sortie entre amis n'est pas un cas d'usage
// réaliste. Ajoutée à la liste uniquement quand mood === 'touriste'.
export const WEEK_DURATION: { key: Duration; labelKey: string; emoji: string } = {
  key: 'semaine', labelKey: 'itin_duration_week', emoji: '🧳',
};

export const BUDGETS: Array<{ key: Budget; emoji: string; labelKey: string; desc: string }> = [
  { key: 'économique', emoji: '💸', labelKey: 'itin_budget_cheap', desc: '< 30€/pers.' },
  { key: 'moyen', emoji: '💶', labelKey: 'itin_budget_medium', desc: '30-80€/pers.' },
  { key: 'premium', emoji: '💎', labelKey: 'itin_budget_premium', desc: '80€+/pers.' },
];

export function findBudget(key: string | undefined) {
  return BUDGETS.find((b) => b.key === key);
}
