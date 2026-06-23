import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

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
 *  - thinking laissé désactivé sur le chemin temps réel (latence < 3 s).
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

  async complete(prompt: string, options: AiCompletionOptions): Promise<string> {
    const response = await this.client.messages.create(
      {
        model: this.model(options.tier),
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        system: options.system,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: this.timeout(options.tier) },
    );

    for (const block of response.content) {
      if (block.type === 'text') return block.text;
    }
    return '';
  }

  async completeStructured<T>(
    prompt: string,
    options: AiCompletionOptions & { jsonSchema: Record<string, unknown> },
  ): Promise<T> {
    const response = await this.client.messages.create(
      {
        model: this.model(options.tier),
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        system: options.system,
        messages: [{ role: 'user', content: prompt }],
        // Contraint la sortie au schéma → premier bloc texte = JSON valide.
        output_config: { format: { type: 'json_schema', schema: options.jsonSchema } },
      } as Anthropic.MessageCreateParamsNonStreaming,
      { timeout: this.timeout(options.tier) },
    );

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('Réponse IA structurée vide');
    }
    return JSON.parse(text.text) as T;
  }
}
