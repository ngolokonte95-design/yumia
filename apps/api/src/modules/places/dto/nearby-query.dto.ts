import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { UNIVERSES, type Universe } from '@yumia/shared';

/** Recherche géolocalisée « autour de moi ». */
export class NearbyQueryDto {
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

  /** Rayon de recherche en mètres (défaut 2 km, max 50 km). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(50_000)
  radius?: number = 2_000;

  @IsOptional()
  @IsIn(UNIVERSES as unknown as string[])
  universe?: Universe;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
