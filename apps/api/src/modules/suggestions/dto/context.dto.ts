import { IsIn, IsOptional, IsString } from 'class-validator';
import { MODES, MOODS, type Mode, type Mood } from '@yumia/shared';

/** Entrée minimale d'une requête de suggestion (contexte utilisateur). */
export class ContextDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  localTimeIso?: string;

  @IsOptional()
  @IsIn(MODES as unknown as string[])
  mode?: Mode;

  @IsOptional()
  @IsIn(MOODS as unknown as string[])
  mood?: Mood;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
