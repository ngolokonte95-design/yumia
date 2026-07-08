import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PassportController } from './passport.controller';
import { SwipeController } from './swipe.controller';
import { PassportService } from './passport.service';

/** Module Passeport & gamification. Importe `AuthModule` pour `JwtAuthGuard`. */
@Module({
  imports: [AuthModule],
  controllers: [PassportController, SwipeController],
  providers: [PassportService],
  exports: [PassportService],
})
export class PassportModule {}
