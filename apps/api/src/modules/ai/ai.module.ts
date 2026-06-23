import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { AI_PROVIDER, type AiProvider } from './providers/ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockProvider } from './providers/mock.provider';
import { AiService } from './ai.service';

/**
 * Sélectionne le provider IA selon la config. Repli automatique sur le mock si
 * `anthropic` est demandé sans clé API → l'app reste fonctionnelle.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider => {
        const ai = config.get<AppConfig['ai']>('ai')!;
        const logger = new Logger('AiModule');

        if (ai.provider === 'anthropic' && ai.anthropicApiKey) {
          return new AnthropicProvider({
            apiKey: ai.anthropicApiKey,
            modelSmart: ai.modelSmart,
            modelFast: ai.modelFast,
            maxTokens: ai.maxTokens,
          });
        }

        if (ai.provider === 'anthropic') {
          logger.warn('AI_PROVIDER=anthropic mais ANTHROPIC_API_KEY absente → repli sur le mock');
        }
        return new MockProvider();
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
