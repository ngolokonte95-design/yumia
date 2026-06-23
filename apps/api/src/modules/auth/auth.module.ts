import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StorageModule } from '../../infra/storage/storage.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthCleanupCron } from './auth-cleanup.cron';

/**
 * Module d'authentification.
 *
 * Les secrets/TTL JWT sont passés explicitement à chaque signature/vérification
 * (cf. `AuthService` / `JwtAuthGuard`), car access et refresh utilisent des
 * secrets distincts — `JwtModule` est donc enregistré sans secret global.
 *
 * `JwtAuthGuard` est exporté pour protéger les routes des futurs modules métier.
 */
@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AuthCleanupCron],
  // JwtModule est ré-exporté pour que `JwtAuthGuard` (utilisé via @UseGuards
  // dans les modules importateurs) puisse résoudre `JwtService` chez eux.
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
