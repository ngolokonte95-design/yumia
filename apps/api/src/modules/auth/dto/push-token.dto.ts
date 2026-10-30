import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, { message: 'Token Expo invalide.' })
  token!: string;

  /** Jeton PushKit (iOS 1.0.1+), en hexadécimal : appels CallKit app fermée. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64,200}$/i, { message: 'Jeton VoIP invalide.' })
  voipToken?: string;

  /** L'app sait afficher sa propre sonnerie d'appel native (1.0.1+). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  nativeCalls?: boolean;
}
