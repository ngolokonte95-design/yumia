import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlacesModule } from '../places/places.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

/**
 * Module des recommandations contextuelles (Top 3).
 * `AiModule` est global ; `PlacesModule` est importé pour la recherche géo.
 */
@Module({
  imports: [AuthModule, PlacesModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
