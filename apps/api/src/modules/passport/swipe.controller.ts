import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { PassportService } from './passport.service';

/**
 * POST /api/swipe — enregistre une préférence swipe (like/dislike).
 * Stocké dans les préférences utilisateur pour nourrir le moteur IA de recommandation.
 */
@Controller('swipe')
@UseGuards(JwtAuthGuard)
export class SwipeController {
  constructor(private readonly passport: PassportService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordSwipe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { placeId: string; liked: boolean },
  ): Promise<void> {
    await this.passport.recordSwipe(user.sub, dto.placeId, dto.liked);
  }
}
