import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SavePlaceDto {
  @IsUUID()
  placeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  listName?: string;
}
