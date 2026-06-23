import { Module } from '@nestjs/common';
import { SuggestionsController } from './suggestions.controller';

/** AiModule est global → AiService est injectable sans import explicite. */
@Module({
  controllers: [SuggestionsController],
})
export class SuggestionsModule {}
