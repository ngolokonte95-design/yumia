import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ItineraryService, type ItineraryRequest, type ItineraryStep } from './itinerary.service';

@Controller('itinerary')
@UseGuards(JwtAuthGuard)
export class ItineraryController {
  constructor(private readonly itinerary: ItineraryService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('generate')
  generate(@CurrentUser() user: JwtPayload, @Body() dto: ItineraryRequest) {
    return this.itinerary.generate(user.sub, dto);
  }

  /** POST /api/itinerary/save — enregistre un itinéraire déjà généré, pour le reconsulter plus tard. */
  @Post('save')
  save(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { mood: string; duration: string; budget: string; city: string; summary: string; steps: ItineraryStep[] },
  ) {
    return this.itinerary.save(user.sub, dto);
  }

  /** GET /api/itinerary/saved — liste des itinéraires enregistrés par l'utilisateur. */
  @Get('saved')
  listSaved(@CurrentUser() user: JwtPayload) {
    return this.itinerary.listSaved(user.sub);
  }

  /** DELETE /api/itinerary/saved/:id */
  @Delete('saved/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSaved(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.itinerary.deleteSaved(user.sub, id);
  }
}
