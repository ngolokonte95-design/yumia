import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Guide, GuideBooking } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { GuidesService } from './guides.service';
import { BookGuideDto } from './dto/book-guide.dto';

/** Guides de randonnée locaux certifiés. */
@ApiTags('guides')
@Controller('guides')
export class GuidesController {
  constructor(private readonly guides: GuidesService) {}

  /** GET /api/guides?city=... — guides certifiés d'une ville. 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  list(@Query('city') city?: string, @Query('limit') limit?: string): Promise<Guide[]> {
    return this.guides.listByCity(city ?? '', limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20);
  }

  /** POST /api/guides/book — réservation d'un guide (commission 20%). 20/60s. */
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('book')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  book(@CurrentUser() user: JwtPayload, @Body() dto: BookGuideDto): Promise<GuideBooking> {
    return this.guides.book(user.sub, dto);
  }
}
