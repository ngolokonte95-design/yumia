import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { UNIVERSES, type Universe } from '@yumia/shared';

/** Création d'un lieu (seed / back-office). */
export class CreatePlaceDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsIn(UNIVERSES as unknown as string[])
  universe!: Universe;

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

  @IsString()
  @Length(1, 80)
  city!: string;

  /** Code pays ISO 3166-1 alpha-2 (ex. « FR »). */
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  /** Niveau de prix 1..4. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  priceTier?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}
