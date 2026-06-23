import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MODES, UNIVERSES, type Mode, type Universe } from '@yumia/shared';

const ITINERARY_MODES: Mode[] = ['date', 'travel'];

/** Contexte d'une requête d'itinéraire (Date / Travel). */
export class ExperienceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(50_000)
  radius?: number = 5_000;

  @IsIn(ITINERARY_MODES)
  mode!: Mode;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsArray()
  @IsIn(UNIVERSES as unknown as string[], { each: true })
  favoriteUniverses?: Universe[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  restrictions?: string[];
}
