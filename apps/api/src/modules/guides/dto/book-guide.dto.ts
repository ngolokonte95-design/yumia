import { IsDateString, IsInt, IsString, Max, Min } from 'class-validator';

/** Corps de POST /guides/book. */
export class BookGuideDto {
  @IsString()
  guideId!: string;

  /** Date de la sortie (ISO). */
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  people!: number;
}
