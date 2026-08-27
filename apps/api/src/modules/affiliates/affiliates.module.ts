import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';
import { BookingProvider } from './providers/booking.provider';

@Module({
  imports: [AuthModule],
  controllers: [AffiliatesController],
  providers: [AffiliatesService, BookingProvider],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
