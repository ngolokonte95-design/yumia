import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ItineraryService, type ItineraryRequest } from './itinerary.service';

@Controller('itinerary')
@UseGuards(JwtAuthGuard)
export class ItineraryController {
  constructor(private readonly itinerary: ItineraryService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('generate')
  generate(@CurrentUser() user: JwtPayload, @Body() dto: ItineraryRequest) {
    return this.itinerary.generate(user.sub, dto);
  }
}
