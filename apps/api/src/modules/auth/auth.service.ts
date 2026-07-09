import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import type { User } from '@prisma/client';
import type { UserPreferences } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import type { AppConfig } from '../../config/configuration';
import type { AuthResult, AuthTokens, JwtPayload, PublicUser } from './types';

const BCRYPT_ROUNDS = 12;
/** Nombre maximum de sessions actives simultanées par utilisateur. */
const MAX_ACTIVE_SESSIONS = 5;

/** Apple JWKS — mis en cache côté jose (TTL intégré). */
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Cœur de l'authentification YUMIA.
 *
 * Stratégie de jetons :
 * - **Access token** : JWT court (HS256), signé avec `jwt.accessSecret`, vérifié par le guard.
 * - **Refresh token** : jeton opaque aléatoire, jamais stocké en clair — seul son
 *   hash SHA-256 est persisté (`RefreshToken.tokenHash`). Rotation à chaque usage :
 *   l'ancien est révoqué et un nouveau est émis (détection de rejeu).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  /** Inscription par email + mot de passe. */
  async register(
    email: string,
    password: string,
    displayName: string,
    locale?: string,
  ): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
        authProvider: 'password',
        ...(locale ? { locale } : {}),
      },
    });

    this.logger.log(`Nouvel utilisateur inscrit : ${user.id}`);
    // Fire-and-forget — ne bloque pas la réponse
    void this.mailer.sendWelcome(normalizedEmail, displayName.trim()).catch(() => {});
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /** Connexion par email + mot de passe. */
  async login(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Message volontairement générique (pas d'énumération de comptes).
    const invalid = new UnauthorizedException('Email ou mot de passe incorrect.');
    if (!user || !user.passwordHash) {
      throw invalid;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw invalid;
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /** Rotation du refresh token : révoque l'ancien, émet une nouvelle paire. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalide ou expiré.');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.user);
  }

  /** Déconnexion : révoque le refresh token fourni (idempotent). */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Révoque tous les refresh tokens de l'utilisateur sur tous ses appareils. */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Profil de l'utilisateur courant (depuis l'ID du JWT). */
  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }
    return toPublicUser(user);
  }

  /**
   * Authentification via Google (id_token signé).
   * Find-or-create : si l'email existe déjà en `password`, on lie le compte Google ;
   * sinon on crée un nouveau compte.
   */
  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const clientId = this.config.get<AppConfig['google']>('google')!.clientId;
    if (!clientId) {
      throw new UnauthorizedException('Google OAuth non configuré sur ce serveur.');
    }

    const client = new OAuth2Client(clientId);
    let payload: { email?: string; name?: string; picture?: string; sub?: string };
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload() ?? {};
    } catch {
      throw new UnauthorizedException('ID token Google invalide.');
    }

    const email = payload.email?.trim().toLowerCase();
    if (!email) throw new UnauthorizedException('Email absent du token Google.');

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // Mise à jour de l'authProvider si le compte était password
      if (user.authProvider !== 'google') {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { authProvider: 'google', photoUrl: payload.picture ?? user.photoUrl },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          displayName: payload.name?.trim() || email.split('@')[0],
          photoUrl: payload.picture ?? null,
          authProvider: 'google',
        },
      });
      this.logger.log(`Nouvel utilisateur Google : ${user.id}`);
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Authentification via Apple Sign-In (identityToken JWT RS256).
   * Find-or-create par `appleUserId` (stable, même si l'email change).
   * Apple ne renvoie le displayName qu'à la première connexion — le conserver côté client.
   * La signature RS256 est vérifiée via le JWKS Apple (mis en cache par jose).
   */
  async loginWithApple(
    identityToken: string,
    appleUserId: string,
    displayName?: string,
  ): Promise<AuthResult> {
    let payload: { sub?: string; email?: string };
    try {
      const { payload: verified } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        algorithms: ['RS256'],
      });
      payload = verified as { sub?: string; email?: string };
    } catch {
      throw new UnauthorizedException('Apple identity token invalide ou expiré.');
    }

    const email = (payload.email as string | undefined)?.trim().toLowerCase();
    const sub = (payload.sub as string | undefined) ?? appleUserId;

    let user = await this.prisma.user.findFirst({
      where: { appleId: appleUserId },
    });

    if (!user && email) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      // Lie l'appleId si le compte existait avec un autre provider
      if (!user.appleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { appleId: appleUserId, authProvider: 'apple' },
        });
      }
    } else {
      const fallbackName =
        displayName?.trim() ||
        (email ? email.split('@')[0] : `user_${sub.slice(-6)}`);
      user = await this.prisma.user.create({
        data: {
          email: email ?? `${appleUserId}@privaterelay.appleid.com`,
          appleId: appleUserId,
          displayName: fallbackName,
          authProvider: 'apple',
        },
      });
      this.logger.log(`Nouvel utilisateur Apple : ${user.id}`);
    }

    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Met à jour le profil (onboarding inclus). Les préférences sont fusionnées
   * (shallow) avec l'existant pour ne pas écraser les clés non fournies.
   */
  async updateProfile(
    userId: string,
    patch: { displayName?: string; bio?: string; locale?: string; photoUrl?: string; preferences?: UserPreferences; gender?: string; birthYear?: number; interestedIn?: string },
  ): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    const mergedPreferences = {
      ...((user.preferences as UserPreferences | null) ?? {}),
      ...(patch.preferences ?? {}),
    };

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.displayName ? { displayName: patch.displayName.trim() } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio.trim() || null } : {}),
        ...(patch.locale ? { locale: patch.locale } : {}),
        ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl } : {}),
        ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
        ...(patch.birthYear !== undefined ? { birthYear: patch.birthYear } : {}),
        ...(patch.interestedIn !== undefined ? { interestedIn: patch.interestedIn } : {}),
        preferences: mergedPreferences as object,
      },
    });
    return toPublicUser(updated);
  }

  /**
   * Demande de réinitialisation — génère un token OTP à 6 chiffres valable 15 min.
   * Toujours 200 (ne révèle pas si l'email existe).
   * En prod : remplacer le console.log par un vrai envoi email (Resend / SES / SMTP).
   */
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return; // réponse silencieuse

    // Invalide les anciens tokens non utilisés
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const otp = String(randomInt(100_000, 1_000_000));
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(otp),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await this.mailer.sendPasswordResetOtp(normalizedEmail, otp);
  }

  /** Réinitialise le mot de passe via l'OTP reçu par email. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Code invalide ou expiré.');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, authProvider: 'password' },
      }),
      // Révoque tous les refresh tokens existants par sécurité
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`Mot de passe réinitialisé pour userId=${record.userId}`);
  }

  /** Émet une paire access + refresh et persiste le hash du refresh. */
  private async issueTokens(user: User): Promise<AuthTokens> {
    const jwtCfg = this.config.get<AppConfig['jwt']>('jwt')!;

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: jwtCfg.accessSecret,
      expiresIn: jwtCfg.accessTtl,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
      },
    });

    // Élagage des sessions excédentaires : conserve les MAX_ACTIVE_SESSIONS
    // plus récentes, révoque les plus anciennes (ex : 6ème appareil).
    const activeSessions = await this.prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (activeSessions.length > MAX_ACTIVE_SESSIONS) {
      const toRevoke = activeSessions.slice(MAX_ACTIVE_SESSIONS).map((s) => s.id);
      await this.prisma.refreshToken.updateMany({
        where: { id: { in: toRevoke } },
        data: { revokedAt: new Date() },
      });
      this.logger.debug(`Session limit reached for ${user.id} — revoked ${toRevoke.length} old session(s)`);
    }

    return { accessToken, refreshToken, expiresIn: jwtCfg.accessTtl };
  }

  /**
   * Active l'abonnement Premium (après achat RevenueCat validé côté client).
   * Synchronise aussi le champ `plan` historique (plus). `plan` ∈ {monthly, annual}.
   */
  async activatePremium(userId: string, plan: 'monthly' | 'annual'): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isPremium: true,
        premiumSince: new Date(),
        premiumPlan: plan,
        plan: 'plus',
      },
    });
    this.logger.log(`Premium activé (${plan}) pour userId=${userId}`);
    return toPublicUser(updated);
  }

  /** Désactive l'abonnement Premium (expiration / annulation / remboursement). */
  async deactivatePremium(userId: string): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isPremium: false,
        premiumPlan: null,
        plan: 'free',
      },
    });
    this.logger.log(`Premium désactivé pour userId=${userId}`);
    return toPublicUser(updated);
  }

  /**
   * Supprime définitivement le compte et toutes les données associées.
   * Prisma cascade supprime les relations liées (RefreshToken, Visit, Passport, etc.)
   * à condition que les FK aient onDelete: Cascade dans le schéma.
   */
  async deleteAccount(userId: string): Promise<void> {
    // Révoque d'abord tous les refresh tokens pour invalider les sessions actives.
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.log(`Compte supprimé : userId=${userId}`);
  }

  /**
   * Construit une archive JSON de toutes les données personnelles de l'utilisateur.
   * Retourne le JSON directement (en production, envoyer par email / S3).
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const [user, visits, saved] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, displayName: true, locale: true, currency: true,
          countryCode: true, plan: true, totalXp: true, level: true, createdAt: true,
        },
      }),
      this.prisma.visit.findMany({
        where: { userId },
        select: { id: true, placeId: true, feedback: true, notes: true, visitedAt: true },
        orderBy: { visitedAt: 'desc' },
      }),
      this.prisma.savedPlace.findMany({
        where: { userId },
        select: { placeId: true, createdAt: true },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      visits,
      savedPlaces: saved,
    };
  }
}

/** Hash déterministe (SHA-256) d'un refresh token opaque pour le stockage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Projette un `User` Prisma vers sa vue publique (sans secret). */
function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    photoUrl: user.photoUrl,
    authProvider: user.authProvider,
    locale: user.locale,
    currency: user.currency,
    countryCode: user.countryCode,
    plan: user.plan,
    isPremium: user.isPremium,
    premiumPlan: user.premiumPlan,
    totalXp: user.totalXp,
    level: user.level,
    preferences: (user.preferences as PublicUser['preferences'] | null) ?? {},
    createdAt: user.createdAt,
    gender: (user as any).gender ?? null,
    birthYear: (user as any).birthYear ?? null,
    interestedIn: (user as any).interestedIn ?? 'everyone',
  };
}
