import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token opaque obtenu lors de la connexion' })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
