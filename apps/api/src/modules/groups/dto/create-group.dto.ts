import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}
