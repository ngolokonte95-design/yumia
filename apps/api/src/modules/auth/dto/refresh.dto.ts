import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token opaque obtenu lors de la connexion' })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

/**
 * Déconnexion : le refresh token de la session, et facultativement le jeton
 * push de l'appareil — fourni, seul ce jeton est effacé (les autres appareils
 * du compte gardent leurs notifications) ; absent, le jeton enregistré l'est.
 */
export class LogoutDto extends RefreshDto {
  @ApiPropertyOptional({ description: 'Jeton push Expo de cet appareil (ExponentPushToken[…])' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pushToken?: string;
}
