import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { UNIVERSES, type Universe } from '@yumia/shared';

export class SearchDto {
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
  @MinLength(1)
  @MaxLength(300)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(50_000)
  radius?: number = 5_000;

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

  /** Restreint la recherche à un seul univers. */
  @IsOptional()
  @IsIn(UNIVERSES as unknown as string[])
  universeFilter?: Universe;

  /** Tier de prix maximum (1 = bon marché … 4 = luxe). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  maxPriceTier?: number;
}
