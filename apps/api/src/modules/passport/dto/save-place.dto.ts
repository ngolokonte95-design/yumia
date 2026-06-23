import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** Sauvegarde d'un lieu dans une liste (défaut « à essayer »). */
export class SavePlaceDto {
  @IsUUID()
  placeId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  listName?: string;
}
