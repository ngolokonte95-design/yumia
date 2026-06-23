import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
}
