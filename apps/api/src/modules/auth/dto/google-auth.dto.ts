import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'ID token signé par Google (expo-auth-session)' })
  @IsString()
  idToken!: string;

  /**
   * Date de naissance (AAAA-MM-JJ), exigée seulement quand le jeton conduit à
   * CRÉER un compte. Un utilisateur qui se reconnecte n'a rien à ressaisir :
   * le serveur répond alors `AGE_REQUIRED` et le client ne demande la date
   * qu'à ce moment-là.
   */
  @ApiPropertyOptional({ example: '2000-04-17' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance attendue au format AAAA-MM-JJ.' })
  birthDate?: string;
}
