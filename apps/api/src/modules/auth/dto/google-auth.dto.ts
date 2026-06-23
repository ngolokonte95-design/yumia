import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'ID token signé par Google (expo-auth-session)' })
  @IsString()
  idToken!: string;
}
