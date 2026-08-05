import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { NotebookService, type NoteInput } from './notebook.service';

@ApiTags('notebook')
@ApiBearerAuth('access-token')
@Controller('notebook')
@UseGuards(JwtAuthGuard)
export class NotebookController {
  constructor(private readonly notebook: NotebookService) {}

  /**
   * GET /api/notebook
   * Filtres : ?archived= ?favorite= ?q= ?placeId= ?calendarEventId= ?date=
   */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('archived') archived?: string,
    @Query('favorite') favorite?: string,
    @Query('q') q?: string,
    @Query('placeId') placeId?: string,
    @Query('calendarEventId') calendarEventId?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notebook.list(user.sub, {
      archived: archived === 'true',
      favorite: favorite === undefined ? undefined : favorite === 'true',
      query: q,
      placeId,
      calendarEventId,
      date,
    }, limit ? +limit : 100);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notebook.get(user.sub, id);
  }

  /** POST /api/notebook — crée une note. 120/60s (saisie rapide). */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: NoteInput) {
    return this.notebook.create(user.sub, body);
  }

  /** PATCH /api/notebook/:id — mise à jour partielle. 240/60s (autosave). */
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: NoteInput,
  ) {
    return this.notebook.update(user.sub, id, body);
  }

  /** PATCH /api/notebook/:id/archive — archive ou restaure. */
  @Patch(':id/archive')
  archive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { archived: boolean },
  ) {
    return this.notebook.setArchived(user.sub, id, !!body.archived);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    await this.notebook.remove(user.sub, id);
  }
}
