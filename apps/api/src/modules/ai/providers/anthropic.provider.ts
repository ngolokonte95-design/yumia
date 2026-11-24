import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';
import { assertUsable, claudeTuning, responseText, withHeadroom } from '../claude-model';

interface AnthropicProviderConfig {
  apiKey: string;
  modelSmart: string;
  modelFast: string;
  maxTokens: number;
}

/**
 * Provider Anthropic Claude.
 *
 * Choix volontaires :
 *  - modèles « tiered » : smart (raisonnement) vs fast (temps réel) ;
 *  - PAS de `temperature` : certains modèles récents la rejettent → on l'omet
 *    pour rester compatible multi-modèle ;
 *  - sorties structurées via `output_config.format` (JSON schema) pour des
 *    réponses déterministes et parsables ;
 *  - Claude Haiku 5.5 (18/11/2026) : réflexion adaptative avec un effort
 *    `low` pour le temps réel (fast) et `medium` pour le raisonnement
 *    (smart) ; plafonds élargis, texte lu par type de bloc (claude-model.ts).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  private model(tier: AiCompletionOptions['tier']): string {
    return tier === 'smart' ? this.config.modelSmart : this.config.modelFast;
  }

  private timeout(tier: AiCompletionOptions['tier']): number {
    return tier === 'smart' ? 30_000 : 15_000;
  }

  private effort(tier: AiCompletionOptions['tier']) {
    return tier === 'smart' ? 'medium' as const : 'low' as const;
  }

  async complete(prompt: string, options: AiCompletionOptions): Promise<string> {
    const maxTokens = withHeadroom(options.maxTokens ?? this.config.maxTokens, this.effort(options.tier));
    const response = await this.client.messages.create(
      {
        model: this.model(options.tier),
        max_tokens: maxTokens,
        system: options.system,
        messages: [{ role: 'user', content: prompt }],
        ...claudeTuning(this.effort(options.tier)),
      } as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: this.timeout(options.tier) },
    );
    assertUsable(response, maxTokens);
    return responseText(response);
  }

  async completeStructured<T>(
    prompt: string,
    options: AiCompletionOptions & { jsonSchema: Record<string, unknown> },
  ): Promise<T> {
    const maxTokens = withHeadroom(options.maxTokens ?? this.config.maxTokens, this.effort(options.tier));
    const response = await this.client.messages.create(
      {
        model: this.model(options.tier),
        max_tokens: maxTokens,
        system: options.system,
        messages: [{ role: 'user', content: prompt }],
        thinking: { type: 'adaptive' },
        // Contraint la sortie au schéma → le texte de la réponse = JSON valide.
        output_config: {
          format: { type: 'json_schema', schema: options.jsonSchema },
          effort: this.effort(options.tier),
        },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: this.timeout(options.tier) },
    );
    assertUsable(response, maxTokens);

    const text = responseText(response);
    if (!text) throw new Error('Réponse IA structurée vide');
    return JSON.parse(text) as T;
  }
}
