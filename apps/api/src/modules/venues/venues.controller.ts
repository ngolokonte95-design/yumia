import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Venue } from '@prisma/client';
import { VenuesService } from './venues.service';

/** Établissements partenaires (boost). */
@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** GET /api/venues/boosted — établissements boostés à intégrer en priorité. 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('boosted')
  boosted(@Query('limit') limit?: string): Promise<Venue[]> {
    return this.venues.boosted(limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20);
  }
}
