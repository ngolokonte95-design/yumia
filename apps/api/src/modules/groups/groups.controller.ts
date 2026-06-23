import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/types';
import { CreateGroupDto } from './dto/create-group.dto';
import { VoteDto } from './dto/vote.dto';
import { GroupsService } from './groups.service';

class SuggestDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsOptional() @IsString() locale?: string;
}

@ApiTags('groups')
@ApiBearerAuth('access-token')
@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  /** POST /api/groups — crée une session et y rejoint automatiquement. 10/60s. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() _dto: CreateGroupDto) {
    return this.groups.create(user.sub);
  }

  /** POST /api/groups/join/:code — rejoint une session via son code court. 20/60s. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('join/:code')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.groups.join(user.sub, code);
  }

  /** GET /api/groups/:id — état courant de la session (polling). */
  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.groups.get(id, user.sub);
  }

  /** POST /api/groups/:id/suggest — hôte lance la recherche IA et passe en vote. 5/60s. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/suggest')
  @HttpCode(HttpStatus.OK)
  suggest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuggestDto,
  ) {
    return this.groups.suggest(user.sub, id, dto.lat, dto.lng, dto.locale ?? 'fr');
  }

  /** POST /api/groups/:id/vote — soumet un vote like/dislike sur un lieu. 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  vote(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteDto,
  ) {
    return this.groups.vote(user.sub, id, dto.placeId, dto.vote);
  }

  /** POST /api/groups/:id/decide — désigne le lieu retenu par le groupe. */
  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('placeId') placeId: string,
  ) {
    return this.groups.decide(user.sub, id, placeId);
  }
}
