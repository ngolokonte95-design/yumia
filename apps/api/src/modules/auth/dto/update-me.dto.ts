import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { UNIVERSES, type Universe } from '@yumia/shared';

export class PreferencesDto {
  @ApiPropertyOptional({ type: [String], example: ['restaurant', 'bar'] })
  @IsOptional()
  @IsArray()
  @IsIn(UNIVERSES as unknown as string[], { each: true })
  favoriteUniverses?: Universe[];

  @ApiPropertyOptional({ type: [String], example: ['Halal', 'Sans alcool'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  restrictions?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifDigest?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifStreak?: boolean;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Alice Dupont', minLength: 2, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Passionné de gastronomie et de voyages.', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({ example: 'https://cdn.yumia.app/avatars/alice.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  photoUrl?: string;

  @ApiPropertyOptional({ type: PreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ example: 'male', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @ApiPropertyOptional({ example: 1995 })
  @IsOptional()
  @IsInt()
  @Min(1920)
  @Max(2010)
  birthYear?: number;

  @ApiPropertyOptional({ example: 'everyone', enum: ['male', 'female', 'everyone'] })
  @IsOptional()
  @IsIn(['male', 'female', 'everyone'])
  interestedIn?: string;
}
