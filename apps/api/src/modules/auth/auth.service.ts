import {
  ForbiddenException,
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
import type { Prisma, User } from '@prisma/client';
import type { UserPreferences } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { StorageService } from '../../infra/storage/storage.service';
import { RedisService } from '../../infra/redis/redis.service';
import { collectOwnedMediaUrls, deleteRevenueCatSubscriber, purgeUserRedisState } from './account-cleanup';
import type { AppConfig } from '../../config/configuration';
import type { AuthResult, AuthTokens, JwtPayload, PublicUser } from './types';
import { assertClean } from '../../common/moderation/moderation';
import { MIN_SIGNUP_AGE, assertSignupAge } from './age';

const BCRYPT_ROUNDS = 12;
/** Nombre maximum de sessions actives simultanées par utilisateur. */
const MAX_ACTIVE_SESSIONS = 5;

/** Extracts a 2-letter country code from a BCP-47 locale tag (e.g. "fr-FR" → "FR", "fr" → null). */
function extractCountryFromLocale(locale?: string): string | null {
  if (!locale) return null;
  const parts = locale.split('-');
  if (parts.length >= 2) return parts[parts.length - 1].toUpperCase().slice(0, 2);
  return null;
}

/**
 * Auteur d'un signalement dont le compte a été supprimé. `Report.reporterId`
 * n'accepte pas NULL : le signalement reste pour la modération, sans lien
 * vers la personne (la modération affiche alors un auteur inconnu).
 */
export const DELETED_REPORTER_ID = 'deleted-user';

/** Plafonds de l'export de données (les plus récents d'abord). */
const EXPORT_CAP = { posts: 2000, interactions: 5000, messages: 5000, notifications: 1000 } as const;

/** Codes faux tolérés par demande de réinitialisation. */
const MAX_RESET_ATTEMPTS = 5;

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
/**
 * Refuse l'entrée à un compte suspendu, en disant pourquoi.
 *
 * Complète le contrôle du `JwtAuthGuard`, qui bloque les écritures : ici on
 * empêche d'obtenir un nouveau jeton, là-bas on neutralise celui déjà émis.
 */
function assertNotSuspended(user: { suspendedUntil: Date | null; suspendedReason: string | null }): void {
  if (!user.suspendedUntil || user.suspendedUntil <= new Date()) return;
  throw new ForbiddenException({
    code: 'ACCOUNT_SUSPENDED',
    message: user.suspendedReason
      ? `Ton compte est suspendu : ${user.suspendedReason}`
      : 'Ton compte est suspendu.',
    until: user.suspendedUntil.toISOString(),
  });
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
  ) {}

  /** Inscription par email + mot de passe. */
  async register(
    email: string,
    password: string,
    displayName: string,
    birthDate: string,
    locale?: string,
  ): Promise<AuthResult> {
    assertClean(displayName);
    // Avant toute écriture : une inscription refusée ne doit laisser aucune trace.
    const birthYear = assertSignupAge(birthDate);
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const countryCode = extractCountryFromLocale(locale);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
        authProvider: 'password',
        birthYear,
        ...(locale ? { locale } : {}),
        ...(countryCode ? { countryCode } : {}),
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

    // Une personne suspendue doit savoir pourquoi elle ne peut plus entrer :
    // un « email ou mot de passe incorrect » l'enverrait réinitialiser un mot
    // de passe qui fonctionne très bien.
    assertNotSuspended(user);

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

  /**
   * Déconnexion : révoque le refresh token fourni (idempotent) et oublie le
   * jeton push de l'appareil — sans quoi un téléphone déconnecté (ou prêté,
   * revendu) continuait d'afficher les notifications du compte. Si l'app
   * envoie son `pushToken`, seul ce jeton est effacé ; sinon, celui enregistré.
   */
  async logout(refreshToken: string, pushToken?: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (record) {
      await this.prisma.user.updateMany({
        where: { id: record.userId, ...(pushToken ? { expoPushToken: pushToken } : {}) },
        data: { expoPushToken: null },
      });
    }
  }

  /** Révoque tous les refresh tokens de l'utilisateur sur tous ses appareils (et son jeton push). */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.updateMany({ where: { id: userId }, data: { expoPushToken: null } }),
    ]);
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
  async loginWithGoogle(idToken: string, birthDate?: string): Promise<AuthResult> {
    const { audiences } = this.config.get<AppConfig['google']>('google')!;
    if (audiences.length === 0) {
      throw new UnauthorizedException('Google OAuth non configuré sur ce serveur.');
    }

    const client = new OAuth2Client();
    let payload: { email?: string; email_verified?: boolean; name?: string; picture?: string; sub?: string };
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload() ?? {};
    } catch {
      throw new UnauthorizedException('ID token Google invalide.');
    }

    const email = payload.email?.trim().toLowerCase();
    if (!email) throw new UnauthorizedException('Email absent du token Google.');
    // Une adresse non vérifiée chez Google ne prouve pas qu'on la possède :
    // on ne s'en sert ni pour créer ni pour retrouver un compte.
    if (payload.email_verified !== true) throw new UnauthorizedException('Adresse Google non vérifiée.');

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.authProvider !== 'google') {
        user = await this.linkExternalIdentity(user.id, { authProvider: 'google', photoUrl: payload.picture ?? user.photoUrl });
      }
    } else {
      // Seule la CRÉATION est soumise à la barrière d'âge : un compte existant
      // se reconnecte sans rien ressaisir.
      const birthYear = assertSignupAge(birthDate);
      user = await this.prisma.user.create({
        data: {
          email,
          displayName: payload.name?.trim() || email.split('@')[0],
          photoUrl: payload.picture ?? null,
          authProvider: 'google',
          birthYear,
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
    birthDate?: string,
  ): Promise<AuthResult> {
    let payload: { sub?: string; email?: string };
    try {
      const { payload: verified } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: 'https://appleid.apple.com',
        // Sans audience, un jeton Apple émis pour N'IMPORTE QUELLE app était accepté.
        audience: this.config.get<AppConfig['apple']>('apple')!.audiences,
        algorithms: ['RS256'],
      });
      payload = verified as { sub?: string; email?: string };
    } catch {
      throw new UnauthorizedException('Apple identity token invalide ou expiré.');
    }

    // L'identité, c'est le `sub` SIGNÉ par Apple — jamais l'`appleUserId` du
    // corps de la requête, qu'un attaquant choisit librement (il suffisait
    // d'y mettre celui d'une victime avec son propre jeton pour entrer chez elle).
    const sub = payload.sub;
    if (!sub || sub !== appleUserId) throw new UnauthorizedException('Apple identity token invalide ou expiré.');
    const email = (payload.email as string | undefined)?.trim().toLowerCase();

    let user = await this.prisma.user.findFirst({
      where: { appleId: sub },
    });

    if (!user && email) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      if (!user.appleId) {
        user = await this.linkExternalIdentity(user.id, { appleId: sub, authProvider: 'apple' });
      }
    } else {
      // Voir loginWithGoogle : barrière à la création seulement.
      const birthYear = assertSignupAge(birthDate);
      const fallbackName =
        displayName?.trim() ||
        (email ? email.split('@')[0] : `user_${sub.slice(-6)}`);
      user = await this.prisma.user.create({
        data: {
          email: email ?? `${sub}@privaterelay.appleid.com`,
          appleId: sub,
          displayName: fallbackName,
          authProvider: 'apple',
          birthYear,
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
    // Le pseudo et la bio sont publics : ils relèvent du même filtrage que les
    // publications (règle Apple 1.2).
    assertClean(patch.displayName);
    assertClean(patch.bio);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    // L'année de naissance ouvre (ou non) Tind et les Rencontres, réservés aux
    // majeurs : une fois connue, elle ne se modifie plus depuis l'app — sinon
    // un mineur n'aurait qu'à la changer. Un ancien compte sans année peut la
    // renseigner une fois.
    if (patch.birthYear !== undefined && patch.birthYear !== user.birthYear) {
      if (user.birthYear !== null) {
        throw new BadRequestException({ code: 'BIRTH_YEAR_LOCKED', message: "L'année de naissance ne peut plus être modifiée." });
      }
      const age = new Date().getUTCFullYear() - patch.birthYear;
      if (!Number.isInteger(patch.birthYear) || age < MIN_SIGNUP_AGE || age > 120) {
        throw new BadRequestException('Année de naissance invalide.');
      }
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

  /**
   * Réinitialise le mot de passe via l'OTP reçu par email.
   *
   * Le code (6 chiffres) était cherché parmi TOUS les comptes, sans limite
   * d'essais : il suffisait d'en essayer assez pour tomber sur une demande en
   * cours et prendre le compte. Désormais on vise le compte par son e-mail, et
   * sa demande est annulée au 5e code faux (5 chances sur un million).
   */
  async resetPassword(emailRaw: string, token: string, newPassword: string): Promise<void> {
    const invalid = new BadRequestException('Code invalide ou expiré.');
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.trim().toLowerCase() } });
    if (!user) throw invalid;
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw invalid;

    if (record.tokenHash !== hashToken(token)) {
      const attempts = record.attempts + 1;
      await this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: attempts >= MAX_RESET_ATTEMPTS ? { attempts, usedAt: new Date() } : { attempts },
      });
      throw invalid;
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
    // Ici plutôt qu'à chaque connexion : Google, Apple et le rafraîchissement
    // de session passent tous par là. Seule la connexion par mot de passe
    // vérifiait la suspension, et un compte banni restait connecté tant que
    // l'app renouvelait sa session.
    assertNotSuspended(user);
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
   * Rattache une identité Google/Apple à un compte existant retrouvé par son
   * e-mail. L'inscription par mot de passe ne vérifie pas l'e-mail : un
   * inconnu pouvait créer un compte à l'adresse de quelqu'un, attendre que
   * cette personne se connecte avec Google ou Apple, puis rentrer avec SON
   * mot de passe. Le fournisseur prouve l'adresse ; le mot de passe posé par
   * on ne sait qui est donc effacé et les sessions ouvertes sont coupées.
   * Le vrai propriétaire garde l'accès (Google/Apple, ou « mot de passe oublié »).
   */
  private async linkExternalIdentity(
    userId: string,
    data: { authProvider: 'google' | 'apple'; appleId?: string; photoUrl?: string | null },
  ) {
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { ...data, passwordHash: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    this.logger.log(`Identité ${data.authProvider} rattachée à ${userId} — mot de passe et sessions réinitialisés`);
    return user;
  }

  /**
   * Supprime définitivement le compte et toutes les données associées
   * (RGPD art. 17, App Store 5.1.1(v)).
   *
   * Seules quelques relations ont un `onDelete: Cascade` dans le schéma
   * (RefreshToken, PasswordResetToken, Visit, SavedPlace, CalendarEvent,
   * NotebookNote, EarnedBadge, Streak, Notification reçues, SavedItinerary,
   * Cart, WishlistItem, ShippingAddress, ProductReview) ; pour tout le reste le
   * `userId` est une colonne brute : `user.delete()` seul laisserait des
   * orphelins. Chaque table est donc traitée explicitement, en trois temps :
   *
   * 1. Lectures : médias à effacer, compteurs à corriger, conversations,
   *    notifications d'autrui qui parlent de lui (tant que les lignes existent).
   * 2. Transaction : suppression / anonymisation en base, atomique.
   * 3. Best-effort après validation : fichiers, Redis, RevenueCat, notes
   *    moyennes. Un échec y est journalisé mais n'annule rien.
   *
   * Conservés, détachés du compte : commandes, billets, réservations de guide
   * (pièces comptables, 10 ans — art. L123-22 C. com., RGPD art. 17.3.b).
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');

    // ── 1. Lectures préalables ──────────────────────────────────────────────
    const [
      mediaUrls, likes, commentLikes, storyViews, taggedPosts, participations,
      myComments, myPosts, myStories, myReviews, myProductReviews, myMeetups, messageReports,
    ] = await Promise.all([
      collectOwnedMediaUrls(this.prisma, userId),
      this.prisma.postLike.findMany({ where: { userId }, select: { postId: true } }),
      this.prisma.commentLike.findMany({ where: { userId }, select: { commentId: true } }),
      this.prisma.storyView.findMany({ where: { userId }, select: { storyId: true } }),
      this.prisma.post.findMany({
        where: { userId: { not: userId }, taggedUserIds: { has: userId } },
        select: { id: true, taggedUserIds: true },
      }),
      this.prisma.conversationParticipant.findMany({ where: { userId }, select: { conversationId: true } }),
      this.prisma.postComment.findMany({ where: { userId }, select: { id: true, postId: true } }),
      this.prisma.post.findMany({ where: { userId }, select: { id: true } }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true } }),
      this.prisma.placeReview.findMany({ where: { userId }, select: { id: true, placeId: true } }),
      this.prisma.productReview.findMany({ where: { userId }, select: { productId: true } }),
      this.prisma.meetupEvent.findMany({ where: { hostId: userId }, select: { id: true } }),
      this.prisma.report.findMany({ where: { targetType: 'message' }, select: { targetId: true } }),
    ]);

    const likedPostIds = [...new Set(likes.map((l) => l.postId))];
    const likedCommentIds = [...new Set(commentLikes.map((l) => l.commentId))];
    const viewedStoryIds = [...new Set(storyViews.map((v) => v.storyId))];
    const commentIds = myComments.map((c) => c.id);
    const convIds = [...new Set(participations.map((p) => p.conversationId))];

    // Conversations : celles où il ne reste personne disparaissent ; un groupe
    // qu'il a créé passe au premier autre participant.
    const conversations = convIds.length
      ? await this.prisma.conversation.findMany({
          where: { id: { in: convIds } },
          select: { id: true, creatorId: true, participants: { select: { userId: true } } },
        })
      : [];
    const partnerIds = new Set<string>();
    const emptyConvIds: string[] = [];
    const creatorTransfers: Array<{ id: string; to: string }> = [];
    for (const c of conversations) {
      const others = c.participants.map((p) => p.userId).filter((id) => id !== userId);
      others.forEach((id) => partnerIds.add(id));
      if (others.length === 0) emptyConvIds.push(c.id);
      else if (c.creatorId === userId) creatorTransfers.push({ id: c.id, to: others[0] });
    }

    // Signalements visant ses messages (les autres cibles se retrouvent par id).
    const reportedMessageIds = messageReports.length
      ? (await this.prisma.message.findMany({
          where: { id: { in: messageReports.map((r) => r.targetId) }, senderId: userId },
          select: { id: true },
        })).map((m) => m.id)
      : [];

    const notificationIds = await this.notificationsAboutUser(user, {
      likedPostIds,
      commentedPostIds: [...new Set(myComments.map((c) => c.postId))],
      commentIds: new Set(commentIds),
      convIds: new Set(convIds),
      partnerIds: [...partnerIds],
    });

    // ── 2. Transaction ──────────────────────────────────────────────────────
    const ops: Prisma.PrismaPromise<unknown>[] = [
      // Compteurs du contenu d'autrui : ses j'aime et ses vues ne comptent plus.
      // Une ligne PostLike/CommentLike/StoryView par personne → -1 exactement.
      this.prisma.post.updateMany({
        where: { id: { in: likedPostIds }, likesCount: { gt: 0 } },
        data: { likesCount: { decrement: 1 } },
      }),
      this.prisma.postComment.updateMany({
        where: { id: { in: likedCommentIds }, likesCount: { gt: 0 } },
        data: { likesCount: { decrement: 1 } },
      }),
      this.prisma.story.updateMany({
        where: { id: { in: viewedStoryIds }, viewCount: { gt: 0 } },
        data: { viewCount: { decrement: 1 } },
      }),
      // Identifications et collaborations sur les publications d'autrui.
      ...taggedPosts.map((p) =>
        this.prisma.post.update({
          where: { id: p.id },
          data: { taggedUserIds: p.taggedUserIds.filter((id) => id !== userId) },
        }),
      ),
      this.prisma.post.updateMany({ where: { collabUserId: userId }, data: { collabUserId: null } }),

      // Ses interactions sur le contenu d'autrui.
      this.prisma.postLike.deleteMany({ where: { userId } }),
      this.prisma.commentLike.deleteMany({ where: { userId } }),
      this.prisma.postComment.deleteMany({ where: { userId } }),
      this.prisma.postSave.deleteMany({ where: { userId } }),
      this.prisma.repost.deleteMany({ where: { userId } }),
      this.prisma.storyView.deleteMany({ where: { userId } }),
      this.prisma.storyPollVote.deleteMany({ where: { userId } }),

      // Son contenu (cascade vers les likes/commentaires/vues/items restants).
      this.prisma.post.deleteMany({ where: { userId } }),
      this.prisma.story.deleteMany({ where: { userId } }),
      this.prisma.storyHighlight.deleteMany({ where: { userId } }),
      this.prisma.savedCollection.deleteMany({ where: { userId } }),
      this.prisma.placeReview.deleteMany({ where: { userId } }),
      this.prisma.note.deleteMany({ where: { userId } }),
      this.prisma.userQuest.deleteMany({ where: { userId } }),
      this.prisma.meetupRsvp.deleteMany({ where: { userId } }),
      // Ses sorties organisées (les inscriptions partent en cascade).
      this.prisma.meetupEvent.deleteMany({ where: { hostId: userId } }),

      // Messagerie — décision produit : ses messages disparaissent pour tout
      // le monde (réactions en cascade). Les messages d'autrui qui pointaient
      // sur un de ses fichiers (réponse à sa story) perdent le lien.
      this.prisma.message.deleteMany({ where: { senderId: userId } }),
      this.prisma.messageReaction.deleteMany({ where: { userId } }),
      this.prisma.conversationParticipant.deleteMany({ where: { userId } }),
      ...creatorTransfers.map((t) =>
        this.prisma.conversation.update({ where: { id: t.id }, data: { creatorId: t.to } }),
      ),
      this.prisma.conversation.updateMany({ where: { creatorId: userId }, data: { creatorId: null } }),
      this.prisma.conversation.deleteMany({ where: { id: { in: emptyConvIds } } }),

      // Graphe social, dans les deux sens.
      this.prisma.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } }),
      this.prisma.followRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { targetId: userId }] } }),
      this.prisma.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
      this.prisma.encounter.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
      this.prisma.mute.deleteMany({ where: { OR: [{ userId }, { mutedId: userId }] } }),
      this.prisma.restrict.deleteMany({ where: { OR: [{ userId }, { restrictedId: userId }] } }),
      this.prisma.closeFriend.deleteMany({ where: { OR: [{ userId }, { friendId: userId }] } }),
      this.prisma.favoriteUser.deleteMany({ where: { OR: [{ userId }, { favoriteId: userId }] } }),

      // Mode groupe : les sessions et les votes restent aux autres, sans lui.
      this.prisma.groupSession.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
      this.prisma.groupMember.updateMany({ where: { userId }, data: { userId: null } }),

      // Signalements : ceux qui le visent (lui ou son contenu, qui disparaît)
      // n'ont plus d'objet ; ceux qu'il a faits restent pour la modération,
      // anonymisés (`reporterId` n'accepte pas NULL — cf. DELETED_REPORTER_ID).
      this.prisma.report.deleteMany({
        where: {
          OR: [
            { targetType: 'user', targetId: userId },
            { targetType: 'post', targetId: { in: myPosts.map((p) => p.id) } },
            { targetType: 'comment', targetId: { in: commentIds } },
            { targetType: 'story', targetId: { in: myStories.map((s) => s.id) } },
            { targetType: 'message', targetId: { in: reportedMessageIds } },
            { targetType: 'review', targetId: { in: myReviews.map((r) => r.id) } },
            { targetType: 'meetup', targetId: { in: myMeetups.map((m) => m.id) } },
          ],
        },
      }),
      this.prisma.report.updateMany({ where: { reporterId: userId }, data: { reporterId: DELETED_REPORTER_ID } }),

      // Notifications reçues par d'autres qui le nomment (abonnement, appel,
      // j'aime, commentaire, message, réponse à une story). Les siennes
      // partent en cascade avec le compte.
      this.prisma.notification.deleteMany({
        where: {
          OR: [
            { id: { in: notificationIds } },
            { data: { path: ['followerId'], equals: userId } },
            { data: { path: ['actorId'], equals: userId } },
            { data: { path: ['path'], string_contains: userId } },
          ],
        },
      }),

      // Registres financiers : conservés pour la comptabilité mais anonymisés.
      this.prisma.ticket.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.guideBooking.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.order.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.affiliateClick.updateMany({ where: { userId }, data: { userId: null } }),

      // Sessions, puis le compte (cascade : visites, favoris, calendrier,
      // bloc-notes, badges, série, notifications, itinéraires, panier, liste
      // d'envies, adresses, avis produits, réinitialisations de mot de passe).
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ];
    if (mediaUrls.length) {
      // Juste avant la suppression du compte : ne touche que les messages d'autrui.
      ops.splice(
        ops.length - 2,
        0,
        this.prisma.message.updateMany({ where: { mediaUrl: { in: mediaUrls } }, data: { mediaUrl: null } }),
      );
    }
    await this.prisma.$transaction(ops);
    this.logger.log(`Compte supprimé : userId=${userId}`);

    // ── 3. Best-effort ──────────────────────────────────────────────────────
    await Promise.allSettled([
      this.storage.removeMany(mediaUrls, userId).then(
        (n) => this.logger.log(`Compte ${userId} : ${n}/${mediaUrls.length} fichier(s) effacé(s)`),
        (err: Error) => this.logger.warn(`Compte ${userId} : fichiers non effacés (${err.message})`),
      ),
      purgeUserRedisState(this.redis, userId, this.logger),
      deleteRevenueCatSubscriber(this.config.get<AppConfig['revenuecat']>('revenuecat')?.secretApiKey, userId, this.logger),
      this.refreshRatings(
        [...new Set(myReviews.map((r) => r.placeId))],
        [...new Set(myProductReviews.map((r) => r.productId))],
      ).catch((err: Error) => this.logger.warn(`Compte ${userId} : notes moyennes non recalculées (${err.message})`)),
    ]);
  }

  /**
   * Notifications reçues par d'autres qui parlent de cet utilisateur et dont
   * les données ne portent pas son identifiant (j'aime, commentaire, message,
   * réponse à une story). On les retrouve par recoupement : destinataire lié
   * à lui, type, et identifiant (commentaire) ou nom affiché dans le texte.
   */
  private async notificationsAboutUser(
    user: { id: string; displayName: string },
    ctx: {
      likedPostIds: string[];
      commentedPostIds: string[];
      commentIds: Set<string>;
      convIds: Set<string>;
      partnerIds: string[];
    },
  ): Promise<string[]> {
    const postIds = [...new Set([...ctx.likedPostIds, ...ctx.commentedPostIds])];
    const owners = postIds.length
      ? await this.prisma.post.findMany({ where: { id: { in: postIds } }, select: { userId: true } })
      : [];
    const recipients = [...new Set([...owners.map((o) => o.userId), ...ctx.partnerIds])].filter((id) => id !== user.id);
    if (recipients.length === 0) return [];

    const rows = await this.prisma.notification.findMany({
      where: { userId: { in: recipients }, type: { in: ['post_like', 'post_comment', 'new_message', 'story_reply'] } },
      select: { id: true, type: true, title: true, body: true, data: true },
    });
    const liked = new Set(ctx.likedPostIds);
    const namePrefix = `${user.displayName} `;
    return rows
      .filter((n) => {
        const d = (n.data ?? {}) as Record<string, unknown>;
        switch (n.type) {
          case 'post_comment':
            return typeof d.commentId === 'string' && ctx.commentIds.has(d.commentId);
          case 'post_like':
            return typeof d.postId === 'string' && liked.has(d.postId) && n.body.startsWith(namePrefix);
          case 'new_message':
            return typeof d.conversationId === 'string' && ctx.convIds.has(d.conversationId) && n.title === user.displayName;
          case 'story_reply':
            return d.actorId === user.id || n.body.startsWith(namePrefix);
          default:
            return false;
        }
      })
      .map((n) => n.id);
  }

  /** Notes moyennes des lieux et produits qu'il avait notés, sans ses avis. */
  private async refreshRatings(placeIds: string[], productIds: string[]): Promise<void> {
    for (const placeId of placeIds) {
      const agg = await this.prisma.placeReview.aggregate({ where: { placeId }, _avg: { rating: true } });
      await this.prisma.place
        .update({ where: { id: placeId }, data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10 } })
        .catch(() => undefined);
    }
    for (const productId of productIds) {
      const agg = await this.prisma.productReview.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { _all: true },
      });
      // Plus aucun avis YUMIA : on laisse l'agrégat AliExpress (cf. catalog.service).
      if (agg._count._all === 0) continue;
      await this.prisma.product
        .update({ where: { id: productId }, data: { rating: agg._avg.rating ?? null, reviewsCount: agg._count._all } })
        .catch(() => undefined);
    }
  }

  /**
   * Archive JSON de toutes les données personnelles (RGPD art. 15 et 20).
   *
   * Les listes les plus longues sont plafonnées (EXPORT_CAP, les plus récentes
   * d'abord) pour que la réponse reste raisonnable ; `limits` le signale.
   * Les messages sont exportés tels qu'ils sont stockés — chiffrés de bout en
   * bout par l'app quand la conversation l'est : le serveur n'a pas la clé.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const cap = EXPORT_CAP;
    const byUser = { where: { userId } };
    const [
      user, visits, saved, posts, comments, likes, commentLikes, saves, reposts,
      stories, highlights, messages, conversations, following, followers,
      followRequestsSent, followRequestsReceived, blocks, mutes, restricts,
      closeFriends, favorites, encounters, calendarEvents, notebookNotes,
      itineraries, placeReviews, productReviews, orders, shippingAddresses,
      notifications, badges, streak, quests, meetupsHosted, meetupRsvps,
      reportsMade, pollVotes, statusNote, wishlist, cart, tickets, guideBookings,
      savedCollections,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, displayName: true, bio: true, photoUrl: true, authProvider: true,
          locale: true, currency: true, countryCode: true, timezone: true,
          plan: true, isPremium: true, premiumSince: true, premiumPlan: true,
          totalXp: true, level: true, preferences: true,
          gender: true, birthYear: true, interestedIn: true, isPrivate: true,
          shareVisits: true, shareEncounters: true, mapAudience: true, encounterAudience: true,
          suspendedUntil: true, suspendedReason: true, createdAt: true, updatedAt: true,
        },
      }),
      this.prisma.visit.findMany({
        where: { userId },
        select: { id: true, placeId: true, feedback: true, notes: true, visitedAt: true },
        orderBy: { visitedAt: 'desc' },
      }),
      this.prisma.savedPlace.findMany({
        where: { userId },
        select: { placeId: true, listName: true, collectionId: true, createdAt: true },
      }),
      this.prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: cap.posts,
        select: {
          id: true, caption: true, placeId: true, mediaUrls: true, videoUrl: true, coverUrl: true,
          voiceTrackUrl: true, musicTrack: true, hashtags: true, taggedUserIds: true, collabUserId: true,
          likesCount: true, viewsCount: true, pinned: true, archived: true, isDraft: true,
          commentsDisabled: true, hideLikeCount: true, createdAt: true, editedAt: true,
        },
      }),
      this.prisma.postComment.findMany({
        ...byUser, orderBy: { createdAt: 'desc' }, take: cap.interactions,
        select: { id: true, postId: true, parentId: true, content: true, createdAt: true },
      }),
      this.prisma.postLike.findMany({ ...byUser, orderBy: { createdAt: 'desc' }, take: cap.interactions, select: { postId: true, createdAt: true } }),
      this.prisma.commentLike.findMany({ ...byUser, orderBy: { createdAt: 'desc' }, take: cap.interactions, select: { commentId: true, createdAt: true } }),
      this.prisma.postSave.findMany({ ...byUser, orderBy: { createdAt: 'desc' }, take: cap.interactions, select: { postId: true, collectionId: true, createdAt: true } }),
      this.prisma.repost.findMany({ ...byUser, orderBy: { createdAt: 'desc' }, take: cap.interactions, select: { postId: true, caption: true, createdAt: true } }),
      this.prisma.story.findMany({
        ...byUser, orderBy: { createdAt: 'desc' },
        select: { id: true, mediaUrl: true, type: true, caption: true, placeId: true, closeFriendsOnly: true, stickers: true, musicTrack: true, viewCount: true, createdAt: true, expiresAt: true },
      }),
      this.prisma.storyHighlight.findMany({
        ...byUser, orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, coverUrl: true, createdAt: true,
          items: { orderBy: { order: 'asc' }, select: { mediaUrl: true, type: true, caption: true, createdAt: true } },
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId }, orderBy: { createdAt: 'desc' }, take: cap.messages,
        select: { id: true, conversationId: true, type: true, content: true, mediaUrl: true, placeId: true, postId: true, durationSec: true, createdAt: true },
      }),
      this.prisma.conversationParticipant.findMany({ ...byUser, select: { conversationId: true, joinedAt: true, lastReadAt: true } }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true, createdAt: true } }),
      this.prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true, createdAt: true } }),
      this.prisma.followRequest.findMany({ where: { requesterId: userId }, select: { targetId: true, createdAt: true } }),
      this.prisma.followRequest.findMany({ where: { targetId: userId }, select: { requesterId: true, createdAt: true } }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true, createdAt: true } }),
      this.prisma.mute.findMany({ ...byUser, select: { mutedId: true, mutePosts: true, muteStories: true, createdAt: true } }),
      this.prisma.restrict.findMany({ ...byUser, select: { restrictedId: true, createdAt: true } }),
      this.prisma.closeFriend.findMany({ ...byUser, select: { friendId: true, createdAt: true } }),
      this.prisma.favoriteUser.findMany({ ...byUser, select: { favoriteId: true, createdAt: true } }),
      // Rencontres : le jour seulement — l'autre membre n'est pas une donnée à lui.
      this.prisma.encounter.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        orderBy: { day: 'desc' }, take: cap.interactions, select: { day: true },
      }),
      this.prisma.calendarEvent.findMany({ ...byUser, orderBy: { startAt: 'desc' } }),
      this.prisma.notebookNote.findMany({ ...byUser, orderBy: { updatedAt: 'desc' } }),
      this.prisma.savedItinerary.findMany({ ...byUser, orderBy: { createdAt: 'desc' } }),
      this.prisma.placeReview.findMany({ ...byUser, select: { placeId: true, rating: true, body: true, photoUrl: true, createdAt: true, updatedAt: true } }),
      this.prisma.productReview.findMany({ ...byUser, select: { productId: true, rating: true, comment: true, createdAt: true } }),
      this.prisma.order.findMany({
        ...byUser, orderBy: { createdAt: 'desc' },
        select: {
          reference: true, status: true, subtotalCents: true, shippingCents: true, totalCents: true, currency: true,
          addressSnapshot: true, trackingNumber: true, trackingUrl: true, paidAt: true, shippedAt: true, createdAt: true,
          items: { select: { titleSnapshot: true, variantLabel: true, quantity: true, unitPriceCents: true } },
        },
      }),
      this.prisma.shippingAddress.findMany({
        ...byUser,
        select: { fullName: true, line1: true, line2: true, city: true, province: true, postalCode: true, countryCode: true, phone: true, isDefault: true, createdAt: true },
      }),
      this.prisma.notification.findMany({
        ...byUser, orderBy: { createdAt: 'desc' }, take: cap.notifications,
        select: { type: true, title: true, body: true, read: true, createdAt: true },
      }),
      this.prisma.earnedBadge.findMany({ ...byUser, select: { badgeKey: true, earnedAt: true } }),
      this.prisma.streak.findUnique({ where: { userId }, select: { current: true, best: true, lastActivityDay: true, freezesLeft: true } }),
      this.prisma.userQuest.findMany({ ...byUser, select: { questId: true, progress: true, completed: true, completedAt: true } }),
      this.prisma.meetupEvent.findMany({ where: { hostId: userId }, select: { id: true, title: true, description: true, city: true, placeId: true, date: true, isPublic: true, createdAt: true } }),
      this.prisma.meetupRsvp.findMany({ ...byUser, select: { meetupId: true, status: true, joinedAt: true } }),
      this.prisma.report.findMany({ where: { reporterId: userId }, select: { targetType: true, targetId: true, reason: true, details: true, status: true, createdAt: true } }),
      this.prisma.storyPollVote.findMany({ ...byUser, select: { storyId: true, optionIndex: true, createdAt: true } }),
      this.prisma.note.findUnique({ where: { userId }, select: { text: true, expiresAt: true, createdAt: true } }),
      this.prisma.wishlistItem.findMany({ ...byUser, select: { productId: true, createdAt: true } }),
      this.prisma.cart.findUnique({ where: { userId }, select: { items: { select: { productId: true, variantId: true, quantity: true } } } }),
      this.prisma.ticket.findMany({ ...byUser, select: { eventId: true, quantity: true, totalPrice: true, status: true, createdAt: true } }),
      this.prisma.guideBooking.findMany({ ...byUser, select: { guideId: true, date: true, people: true, totalPrice: true, status: true, createdAt: true } }),
      this.prisma.savedCollection.findMany({ ...byUser, select: { id: true, name: true, coverUrl: true, createdAt: true } }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      limits: {
        note: 'Listes plafonnées, les plus récentes d’abord.',
        posts: cap.posts, interactions: cap.interactions, messages: cap.messages, notifications: cap.notifications,
      },
      profile: user,
      social: {
        following, followers, followRequestsSent, followRequestsReceived,
        blocks, mutes, restricts, closeFriends, favorites, encounters,
      },
      posts, comments, likes, commentLikes, saves, reposts, savedCollections,
      stories, highlights, storyPollVotes: pollVotes, statusNote,
      messages, conversations,
      visits, savedPlaces: saved, calendarEvents, notebookNotes, itineraries,
      placeReviews, meetupsHosted, meetupRsvps, reportsMade,
      gamification: { xp: user?.totalXp ?? 0, level: user?.level ?? 1, badges, streak, quests },
      shop: { orders, shippingAddresses, productReviews, wishlist, cart: cart?.items ?? [] },
      tickets, guideBookings,
      notifications,
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
    isPrivate: (user as any).isPrivate ?? false,
    shareVisits: user.shareVisits,
    shareEncounters: user.shareEncounters,
    mapAudience: user.mapAudience as PublicUser['mapAudience'],
    encounterAudience: user.encounterAudience as PublicUser['encounterAudience'],
    isAdmin: (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).includes(user.email.toLowerCase()),
  };
}
