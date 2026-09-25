import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MODES, MOODS, type Mode, type Mood } from '@yumia/shared';

/** Entrée minimale d'une requête de suggestion (contexte utilisateur). */
export class ContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  localTimeIso?: string;

  @IsOptional()
  @IsIn(MODES as unknown as string[])
  mode?: Mode;

  @IsOptional()
  @IsIn(MOODS as unknown as string[])
  mood?: Mood;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}
