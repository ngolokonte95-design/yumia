import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversionController } from './conversion.controller';
import { ConversionService } from './conversion.service';
import { TrialCronService } from './trial-cron.service';

/** Global : le webhook RevenueCat et l'admin y écrivent / lisent. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ConversionController],
  providers: [ConversionService, TrialCronService],
  exports: [ConversionService],
})
export class ConversionModule {}
