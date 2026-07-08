import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/types';
import { RecordVisitDto } from './dto/record-visit.dto';
import { SavePlaceDto } from './dto/save-place.dto';
import { PassportService } from './passport.service';

/** Passeport & gamification de l'utilisateur authentifié. */
@ApiTags('passport')
@ApiBearerAuth('access-token')
@Controller('passport')
@UseGuards(JwtAuthGuard)
export class PassportController {
  constructor(private readonly passport: PassportService) {}

  /** POST /api/passport/visits — « J'y suis allé » : enregistre + gamifie. 30/60s anti-farming XP. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('visits')
  recordVisit(@CurrentUser() user: JwtPayload, @Body() dto: RecordVisitDto) {
    return this.passport.recordVisit(user.sub, dto.placeId, dto.feedback, dto.notes);
  }

  /** GET /api/passport — visites récentes + agrégats. */
  @Get()
  getPassport(@CurrentUser() user: JwtPayload) {
    return this.passport.getPassport(user.sub);
  }

  /** GET /api/passport/stats — niveau, progression, streak, badges. */
  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.passport.getStats(user.sub);
  }

  /** GET /api/passport/visits/history?limit=20&cursor=<id> — historique paginé des visites. */
  @Get('visits/history')
  getVisitHistory(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.passport.getVisitHistory(user.sub, limit ? parseInt(limit, 10) : 20, cursor);
  }

  /** GET /api/passport/heatmap — activité des 90 derniers jours (format { "YYYY-MM-DD": count }). */
  @Get('heatmap')
  getHeatmap(@CurrentUser() user: JwtPayload) {
    return this.passport.getHeatmap(user.sub);
  }

  /** GET /api/passport/universes — visites par univers (breakdown). */
  @Get('universes')
  getUniverseBreakdown(@CurrentUser() user: JwtPayload) {
    return this.passport.getUniverseBreakdown(user.sub);
  }

  /** POST /api/passport/streak/freeze — utilise un freeze de streak (YUMIA Plus uniquement). 5/60s. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('streak/freeze')
  @HttpCode(HttpStatus.OK)
  freezeStreak(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ freezesLeft: number; streakCurrent: number }> {
    return this.passport.freezeStreak(user.sub);
  }

  /** GET /api/passport/leaderboard?city=Paris — top 50 utilisateurs de la semaine. */
  @Get('leaderboard')
  getLeaderboard(@Query('city') city?: string) {
    return this.passport.getLeaderboard(city);
  }

  /** GET /api/passport/saved — lieux sauvegardés. */
  @Get('saved')
  listSaved(@CurrentUser() user: JwtPayload) {
    return this.passport.listSaved(user.sub);
  }

  /** POST /api/passport/saved — sauvegarder un lieu. 30/60s. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('saved')
  savePlace(@CurrentUser() user: JwtPayload, @Body() dto: SavePlaceDto) {
    return this.passport.savePlace(user.sub, dto.placeId, dto.listName);
  }

  /** DELETE /api/passport/saved/:placeId — retirer un lieu sauvegardé. */
  @Delete('saved/:placeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(
    @CurrentUser() user: JwtPayload,
    @Param('placeId', ParseUUIDPipe) placeId: string,
  ): Promise<void> {
    await this.passport.unsavePlace(user.sub, placeId);
  }

}
