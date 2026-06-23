import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { StorageService } from '../../infra/storage/storage.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthResult, AuthTokens, JwtPayload, PublicUser } from './types';

/** Endpoints d'authentification : inscription, connexion, rotation, déconnexion, profil. */
@ApiTags('auth')
@SkipThrottle()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /** POST /api/auth/google — connexion / inscription via Google ID token. 10/60s. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  loginWithGoogle(@Body() dto: GoogleAuthDto): Promise<AuthResult> {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  /** POST /api/auth/apple — connexion / inscription via Apple Sign-In (identity token JWT). 10/60s. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  loginWithApple(@Body() dto: AppleAuthDto): Promise<AuthResult> {
    return this.auth.loginWithApple(dto.identityToken, dto.appleUserId, dto.displayName);
  }

  /** POST /api/auth/register — crée un compte et renvoie une première paire de jetons. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto.email, dto.password, dto.displayName, dto.locale);
  }

  /** POST /api/auth/login — authentifie et renvoie une paire de jetons. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto.email, dto.password);
  }

  /** POST /api/auth/refresh — fait tourner le refresh token et renvoie une nouvelle paire. 30/60s. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** POST /api/auth/logout — révoque le refresh token fourni. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  /** POST /api/auth/me/logout-all — révoque tous les refresh tokens sur tous les appareils. */
  @ApiOperation({ summary: 'Se déconnecter de tous les appareils' })
  @ApiBearerAuth('access-token')
  @Post('me/logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.auth.logoutAll(user.sub);
  }

  /** GET /api/auth/me — profil de l'utilisateur authentifié. */
  @ApiOperation({ summary: 'Profil utilisateur courant' })
  @ApiBearerAuth('access-token')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): Promise<PublicUser> {
    return this.auth.me(user.sub);
  }

  /** PATCH /api/auth/me — mise à jour du profil / préférences (onboarding). */
  @ApiOperation({ summary: 'Mettre à jour le profil' })
  @ApiBearerAuth('access-token')
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto): Promise<PublicUser> {
    return this.auth.updateProfile(user.sub, {
      displayName: dto.displayName,
      bio: dto.bio,
      locale: dto.locale,
      photoUrl: dto.photoUrl,
      preferences: dto.preferences,
    });
  }

  /** POST /api/auth/me/avatar — upload d'une nouvelle photo de profil (multipart). */
  @ApiOperation({ summary: 'Upload avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('access-token')
  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
      fileFilter: (_req, file, cb) => {
        const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
        cb(allowed.has(file.mimetype) ? null : new BadRequestException('Format non supporté.'), allowed.has(file.mimetype));
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    const photoUrl = await this.storage.save(file.buffer, file.originalname, 'avatars');
    await this.auth.updateProfile(user.sub, { photoUrl });
    return { photoUrl };
  }

  /** POST /api/auth/forgot-password — envoie un OTP de réinitialisation (toujours 200). */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    return { message: 'Si cet email existe, un code vous a été envoyé.' };
  }

  /** POST /api/auth/reset-password — réinitialise le mot de passe via l'OTP. 5/60s pour bloquer le bruteforce OTP. */
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { message: 'Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.' };
  }

  /** PATCH /api/auth/me/push-token — enregistre ou renouvelle le push token Expo. */
  @ApiOperation({ summary: 'Enregistrer le push token Expo' })
  @ApiBearerAuth('access-token')
  @Patch('me/push-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerPushToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PushTokenDto,
  ): Promise<void> {
    await this.notifications.registerToken(user.sub, dto.token);
  }

  /** DELETE /api/auth/me — supprime définitivement le compte et toutes les données. */
  @ApiOperation({ summary: 'Supprimer mon compte (RGPD)' })
  @ApiBearerAuth('access-token')
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.auth.deleteAccount(user.sub);
  }

  /** POST /api/auth/me/export — retourne une archive JSON des données personnelles. */
  @ApiOperation({ summary: 'Export RGPD des données personnelles' })
  @ApiBearerAuth('access-token')
  @Post('me/export')
  @UseGuards(JwtAuthGuard)
  async exportMyData(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.auth.exportData(user.sub);
    const filename = `yumia-export-${user.sub}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }
}
