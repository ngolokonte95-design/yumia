import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { UNIVERSES, type Universe } from '@yumia/shared';

/** Liste paginée de lieux, filtrable par ville et univers. */
export class ListPlacesDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(UNIVERSES as unknown as string[])
  universe?: Universe;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
