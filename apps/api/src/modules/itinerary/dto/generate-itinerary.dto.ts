import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ItineraryRequest } from '../itinerary.service';

/** Mêmes valeurs que l'app (apps/mobile/lib/itinerary-meta.ts — MOODS). */
export const ITINERARY_MOODS = ['date', 'amis', 'famille', 'solo', 'touriste'] as const;
export const ITINERARY_DURATIONS = ['soirée', 'journée', 'demi-journée', 'weekend', 'semaine'] as const;
export const ITINERARY_BUDGETS = ['économique', 'moyen', 'premium'] as const;

export class GenerateItineraryDto implements ItineraryRequest {
  // Liste fermée : le quota est compté PAR MODE, une valeur libre donnait
  // un quota neuf à chaque variante (« date1 », « date2 »…).
  @IsIn(ITINERARY_MOODS as unknown as string[])
  mood!: string;

  @IsIn(ITINERARY_DURATIONS as unknown as string[])
  duration!: string;

  @IsIn(ITINERARY_BUDGETS as unknown as string[])
  budget!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  interests?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  groupSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  constraints?: string;
}
