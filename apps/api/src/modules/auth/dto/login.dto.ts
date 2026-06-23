import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alice@yumia.app' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SuperSecret99!' })
  @IsString()
  password!: string;
}
