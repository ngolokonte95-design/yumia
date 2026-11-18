/**
 * Modèle Claude de YUMIA et réglages communs à tous les appels.
 *
 * 18/11/2026 : passage à Claude Haiku 5.5 sur demande de l'utilisateur (il
 * remplace Sonnet 4.6 et Haiku 4.5). Ce qui change avec ce modèle :
 *  - la réflexion (thinking) est active par défaut : une réponse peut
 *    commencer par des blocs `thinking` → on lit les blocs `text` par type,
 *    jamais `content[0]` ;
 *  - cette réflexion compte dans `max_tokens`, et le même texte fait ~30 % de
 *    jetons de plus → les plafonds sont élargis (`withHeadroom`) ;
 *  - la profondeur se règle avec `output_config.effort` (défaut `medium`) ;
 *    les chemins temps réel passent en `low` ;
 *  - `temperature`/`top_p`/`top_k` non par défaut et le préremplissage
 *    (prefill) renvoient une 400 : on n'en envoie aucun ;
 *  - un refus de sécurité (`stop_reason: "refusal"`) n'a pas de repli côté
 *    serveur sur ce modèle : on le traite comme une erreur.
 *
 * Le SDK installé (0.71) ne type pas encore `thinking.adaptive` ni `effort` :
 * les champs partent tels quels dans le corps de la requête.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-haiku-5-5';

export type ClaudeEffort = 'low' | 'medium' | 'high';

/** Champs à étaler dans `messages.create` : réflexion adaptative + effort explicite. */
export function claudeTuning(effort: ClaudeEffort): Record<string, unknown> {
  return { thinking: { type: 'adaptive' }, output_config: { effort } };
}

/**
 * Plafond de jetons élargi : place pour la réflexion et pour le nouveau
 * découpage (~30 % de jetons en plus pour le même texte).
 */
export function withHeadroom(maxTokens: number): number {
  return Math.ceil(maxTokens * 1.5);
}

/** Texte de la réponse : tous les blocs `text`, dans l'ordre (les blocs `thinking` sont ignorés). */
export function responseText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Erreur levée quand les filtres de sécurité du modèle déclinent la demande. */
export class ClaudeRefusalError extends Error {
  constructor() {
    super('Demande déclinée par le modèle (refusal)');
    this.name = 'ClaudeRefusalError';
  }
}

/** Lève une erreur claire si le modèle a refusé ou si la réponse a été coupée sans texte. */
export function assertUsable(response: Anthropic.Message, maxTokens: number): void {
  if (response.stop_reason === 'refusal') throw new ClaudeRefusalError();
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`Réponse tronquée : limite de ${maxTokens} jetons atteinte`);
  }
}
