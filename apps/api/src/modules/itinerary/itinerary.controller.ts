import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { Quota } from '../../common/quota/quota.interceptor';
import { ItineraryService, type ItineraryStep } from './itinerary.service';
import { GenerateItineraryDto, ITINERARY_MOODS } from './dto/generate-itinerary.dto';

function moodScope(mood: unknown): string {
  return typeof mood === 'string' && (ITINERARY_MOODS as readonly string[]).includes(mood) ? mood : 'other';
}

@Controller('itinerary')
@UseGuards(JwtAuthGuard)
export class ItineraryController {
  constructor(private readonly itinerary: ItineraryService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('generate')
  // Par mode, comme dans l'app : trois en Date n'entament pas le quota Voyage.
  // Le scope n'accepte que les 5 modes connus (le DTO rejette le reste, et
  // l'intercepteur passe AVANT la validation : une valeur inconnue retombe sur
  // un compteur commun). Le quota total est donc borné à 5 × la limite du mode.
  @Quota({ name: 'itinerary', feature: 'itineraryPerModePerDay', scope: (req) => moodScope(req.body?.mood) })
  generate(@CurrentUser() user: JwtPayload, @Body() dto: GenerateItineraryDto) {
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
