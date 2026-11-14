import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { CLIENT_EVENT_TYPES, ConversionService, type ClientEventType } from './conversion.service';

class ConversionEventDto {
  @IsIn(CLIENT_EVENT_TYPES as unknown as string[])
  type!: ClientEventType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  detail?: string;
}

@ApiTags('conversion')
@ApiBearerAuth('access-token')
@Controller('conversion')
@UseGuards(JwtAuthGuard)
export class ConversionController {
  constructor(private readonly conversion: ConversionService) {}

  /** POST /api/conversion/events — limite atteinte, page des forfaits ouverte. */
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(@CurrentUser() user: JwtPayload, @Body() dto: ConversionEventDto): Promise<void> {
    await this.conversion.record(user.sub, dto.type, dto.detail);
  }
}
