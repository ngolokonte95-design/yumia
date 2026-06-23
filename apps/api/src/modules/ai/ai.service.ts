import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiContext, AiEngine } from '@yumia/shared';
import { AI_PROVIDER, type AiProvider } from './providers/ai-provider.interface';
import { ENGINE_REGISTRY } from './engines/engine.registry';

/**
 * Façade des moteurs IA. Les modules métier (suggestions, feed, experiences)
 * appellent `run(engine, ctx)` sans rien connaître du fournisseur ni des prompts.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {
    this.logger.log(`Provider IA actif : ${provider.name}`);
  }

  /** Exécute un moteur en mode texte libre. */
  async run(engine: AiEngine, ctx: AiContext): Promise<string> {
    const def = ENGINE_REGISTRY[engine];
    return this.provider.complete(def.buildPrompt(ctx), {
      tier: def.tier,
      system: def.system,
    });
  }

  /**
   * Complétion libre hors moteur — pour les chats contextuels one-shot.
   * Le caller fournit son propre system prompt et le message utilisateur.
   */
  async freeChat(
    system: string,
    userPrompt: string,
    tier: import('@yumia/shared').ModelTier = 'smart',
  ): Promise<string> {
    return this.provider.complete(userPrompt, { tier, system, maxTokens: 400 });
  }

  /**
   * Exécute un moteur en sortie structurée (JSON contraint par schéma).
   * Lève si le moteur n'a pas de schéma déclaré.
   */
  async runStructured<T>(engine: AiEngine, ctx: AiContext): Promise<T> {
    const def = ENGINE_REGISTRY[engine];
    if (!def.jsonSchema) {
      throw new Error(`Le moteur ${engine} n'a pas de schéma structuré`);
    }
    return this.provider.completeStructured<T>(def.buildPrompt(ctx), {
      tier: def.tier,
      system: def.system,
      jsonSchema: def.jsonSchema,
    });
  }
}
