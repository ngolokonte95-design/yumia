import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MODES, MOODS, UNIVERSES, type Mode, type Mood, type Universe } from '@yumia/shared';

/** Contexte d'une requête Top 3 : position obligatoire + signaux optionnels. */
export class Top3Dto {
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

  /** Rayon de recherche en mètres (défaut 3 km). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(50_000)
  radius?: number = 3_000;

  @IsOptional()
  @IsString()
  city?: string;

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
  localTimeIso?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  /** Univers favoris de l'utilisateur (onboarding) — booste le score de compatibilité. */
  @IsOptional()
  @IsArray()
  @IsIn(UNIVERSES as unknown as string[], { each: true })
  favoriteUniverses?: Universe[];

  /** Restrictions (végétarien, halal…) — filtre les univers incompatibles. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  restrictions?: string[];

  /** Météo locale fournie par le client (Open-Meteo) — active le moteur weather si extrême. */
  @IsOptional()
  @IsObject()
  weather?: { tempC: number; condition: string };
}
