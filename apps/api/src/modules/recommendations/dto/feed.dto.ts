import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MOODS, UNIVERSES, type Mood, type Universe } from '@yumia/shared';

/** Contexte d'une requête de flux For You. */
export class FeedDto {
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

  @IsOptional()
  @IsIn(MOODS as unknown as string[])
  mood?: Mood;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number = 15;

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

  @IsOptional()
  @IsObject()
  weather?: { tempC: number; condition: string };
}
