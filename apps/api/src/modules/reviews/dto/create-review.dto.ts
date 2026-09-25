import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

/**
 * Avis sur un lieu. C'était une interface : aucune validation, donc une note
 * de 1 000 (ou négative) pouvait fausser `Place.rating`, qui en est la moyenne.
 */
export class CreateReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  photoUrl?: string;
}
