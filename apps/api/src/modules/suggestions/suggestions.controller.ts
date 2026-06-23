import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AiContext } from '@yumia/shared';
import { DEFAULT_LOCALE } from '@yumia/shared';
import { AiService } from '../ai/ai.service';
import { ContextDto } from './dto/context.dto';

interface MoodResult {
  reason: string;
  universesSuggested: string[];
}

/**
 * Démonstration de bout en bout de l'orchestration IA invisible.
 * Le client envoie un contexte ; l'IA interprète l'humeur et propose des univers.
 * (En Phase 1, ce contrôleur croisera ces univers avec `places` pour produire un vrai Top 3.)
 */
@ApiTags('suggestions')
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly ai: AiService) {}

  /** POST /api/suggestions/mood — interprétation contextuelle de l'humeur. 20/60s. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('mood')
  async mood(@Body() dto: ContextDto): Promise<MoodResult> {
    const ctx: AiContext = {
      userId: 'demo',
      locale: dto.locale ?? DEFAULT_LOCALE,
      city: dto.city,
      localTimeIso: dto.localTimeIso ?? new Date().toISOString(),
      mode: dto.mode,
      mood: dto.mood,
      query: dto.query,
    };
    return this.ai.runStructured<MoodResult>('mood', ctx);
  }
}
