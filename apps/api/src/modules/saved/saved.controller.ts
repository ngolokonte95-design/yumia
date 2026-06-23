import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { SavePlaceDto } from './dto/save-place.dto';
import { SavedService, type SavedPlaceResponse } from './saved.service';

@ApiTags('saved')
@ApiBearerAuth('access-token')
@Controller('saved')
@UseGuards(JwtAuthGuard)
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  /** GET /api/saved — liste des lieux sauvegardés. */
  @Get()
  list(@CurrentUser() user: JwtPayload): Promise<SavedPlaceResponse[]> {
    return this.saved.list(user.sub);
  }

  /** GET /api/saved/ids — tableau des placeId sauvegardés (pour hydration côté mobile). */
  @Get('ids')
  ids(@CurrentUser() user: JwtPayload): Promise<string[]> {
    return this.saved.savedIds(user.sub);
  }

  /** POST /api/saved — sauvegarde un lieu (gate freemium 50 max). 30/60s. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(@CurrentUser() user: JwtPayload, @Body() dto: SavePlaceDto): Promise<void> {
    await this.saved.save(user.sub, dto.placeId, dto.listName);
  }

  /** DELETE /api/saved/:placeId — retire un lieu des sauvegardes. */
  @Delete(':placeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(@CurrentUser() user: JwtPayload, @Param('placeId') placeId: string): Promise<void> {
    await this.saved.unsave(user.sub, placeId);
  }
}
