import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuggestionsController } from './suggestions.controller';

/** AiModule est global → AiService est injectable sans import explicite. */
@Module({
  imports: [AuthModule],
  controllers: [SuggestionsController],
})
export class SuggestionsModule {}
