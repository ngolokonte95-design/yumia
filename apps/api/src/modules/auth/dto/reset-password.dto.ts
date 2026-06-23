import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'OTP reçu par email' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'NouveauMotDePasse99!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères.' })
  @MaxLength(72, { message: 'Le mot de passe ne peut dépasser 72 caractères.' })
  @Matches(/[a-zA-Z]/, { message: 'Le mot de passe doit contenir au moins une lettre.' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir au moins un chiffre.' })
  newPassword!: string;
}
