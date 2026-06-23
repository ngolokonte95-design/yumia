import type { ModelTier } from '@yumia/shared';

/** Jeton d'injection NestJS pour le provider IA actif. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiCompletionOptions {
  tier: ModelTier;
  system?: string;
  /** Budget de tokens de sortie. */
  maxTokens?: number;
  /**
   * Schéma JSON attendu (sorties structurées). Si fourni, le provider contraint
   * la réponse à ce schéma et renvoie un objet parsé.
   */
  jsonSchema?: Record<string, unknown>;
}

/**
 * Abstraction d'un fournisseur de modèles. Toute implémentation (Anthropic,
 * OpenAI, mock…) respecte ce contrat ; les moteurs IA n'en dépendent jamais
 * directement d'un fournisseur concret.
 */
export interface AiProvider {
  readonly name: string;

  /** Complétion texte libre. */
  complete(prompt: string, options: AiCompletionOptions): Promise<string>;

  /** Complétion contrainte à un schéma JSON, renvoie un objet typé. */
  completeStructured<T>(prompt: string, options: AiCompletionOptions & { jsonSchema: Record<string, unknown> }): Promise<T>;
}
