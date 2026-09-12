import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'alice@yumia.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SuperSecret99!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères.' })
  @MaxLength(72, { message: 'Le mot de passe ne peut dépasser 72 caractères.' })
  @Matches(/[a-zA-Z]/, { message: 'Le mot de passe doit contenir au moins une lettre.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir au moins un chiffre.' })
  password!: string;

  @ApiProperty({ example: 'Alice Dupont', minLength: 2, maxLength: 40 })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  displayName!: string;

  /**
   * Date de naissance (AAAA-MM-JJ). Obligatoire : c'est la barrière d'âge, et
   * une barrière facultative ne barre rien. Le serveur ne conserve que
   * l'année (voir `assertSignupAge`).
   */
  @ApiProperty({ example: '2000-04-17', description: 'Date de naissance AAAA-MM-JJ' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date de naissance attendue au format AAAA-MM-JJ.' })
  birthDate!: string;

  @ApiPropertyOptional({ example: 'fr', maxLength: 8 })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}
