import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class AppleAuthDto {
  @ApiProperty({ description: 'Identity token JWT signé par Apple' })
  @IsString()
  identityToken!: string;

  @ApiProperty({ description: 'Identifiant utilisateur Apple unique' })
  @IsString()
  appleUserId!: string;

  @ApiPropertyOptional({ example: 'Alice' })
  @IsOptional()
  @IsString()
  displayName?: string;

  /** Date de naissance (AAAA-MM-JJ) — voir `GoogleAuthDto.birthDate`. */
  @ApiPropertyOptional({ example: '2000-04-17' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance attendue au format AAAA-MM-JJ.' })
  birthDate?: string;
}
