import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Venue } from '@prisma/client';
import { VenuesService } from './venues.service';

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  /** GET /api/venues/boosted — établissements boostés à proximité. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('boosted')
  boosted(
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ): Promise<Venue[]> {
    return this.venues.boosted({
      limit: limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 50_000,
    });
  }
}
