import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlacesModule } from '../places/places.module';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';
import { BookingProvider } from './providers/booking.provider';
import { GetYourGuideProvider } from './providers/getyourguide.provider';
import { ViatorProvider } from './providers/viator.provider';

@Module({
  imports: [AuthModule, PlacesModule],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, BookingProvider, GetYourGuideProvider, ViatorProvider],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
