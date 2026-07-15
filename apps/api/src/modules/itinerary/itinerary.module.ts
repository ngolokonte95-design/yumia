import { Module } from '@nestjs/common';
import { ItineraryController } from './itinerary.controller';
import { ItineraryService } from './itinerary.service';
import { AuthModule } from '../auth/auth.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [AuthModule, PlacesModule],
  controllers: [ItineraryController],
  providers: [ItineraryService],
})
export class ItineraryModule {}
