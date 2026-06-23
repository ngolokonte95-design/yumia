import { Logger } from '@nestjs/common';
import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

/**
 * Provider déterministe : aucun appel réseau. Utilisé en dev / tests, et comme
 * repli explicite quand aucune clé IA n'est configurée. L'app reste pleinement
 * navigable sans dépendance externe.
 */
export class MockProvider implements AiProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockProvider.name);

  async complete(prompt: string, _options: AiCompletionOptions): Promise<string> {
    this.logger.debug(`mock.complete(${prompt.slice(0, 40)}…)`);
    return `「mock」 Réponse simulée pour : ${prompt.slice(0, 80)}`;
  }

  async completeStructured<T>(
    _prompt: string,
    options: AiCompletionOptions & { jsonSchema: Record<string, unknown> },
  ): Promise<T> {
    // Construit un objet vide cohérent avec le schéma (valeurs neutres).
    return buildFromSchema(options.jsonSchema) as T;
  }
}

/** Génère une valeur par défaut respectant grossièrement un JSON schema. */
function buildFromSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type as string | undefined;
  switch (type) {
    case 'object': {
      const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(props)) out[key] = buildFromSchema(sub);
      return out;
    }
    case 'array':
      return [];
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}
