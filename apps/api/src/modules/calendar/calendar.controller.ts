import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { CalendarService, type EventInput, type EventOccurrence } from './calendar.service';

@ApiTags('calendar')
@ApiBearerAuth('access-token')
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /**
   * GET /api/calendar?from=&to=&category=
   * Occurrences chevauchant la période, séries récurrentes développées.
   */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('category') category?: string,
  ): Promise<EventOccurrence[]> {
    return this.calendar.list(user.sub, new Date(from), new Date(to), category);
  }

  /** GET /api/calendar/search?q= — recherche plein texte. */
  @Get('search')
  search(
    @CurrentUser() user: JwtPayload,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<EventOccurrence[]> {
    return this.calendar.search(user.sub, q, limit ? +limit : 30);
  }

  /** POST /api/calendar — crée un événement. 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: EventInput,
  ): Promise<EventOccurrence> {
    return this.calendar.create(user.sub, body);
  }

  /** PATCH /api/calendar/:id — modifie un événement (et toute sa série). */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Partial<EventInput>,
  ): Promise<EventOccurrence> {
    return this.calendar.update(user.sub, id, body);
  }

  /** DELETE /api/calendar/:id — supprime l'événement, série comprise. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    await this.calendar.remove(user.sub, id);
  }

  /**
   * DELETE /api/calendar/:id/occurrences/:date — supprime une seule occurrence
   * d'une série, sans toucher au reste.
   */
  @Delete(':id/occurrences/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeOccurrence(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('date') date: string,
  ): Promise<void> {
    await this.calendar.removeOccurrence(user.sub, id, date);
  }
}
