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
import type { User } from '@prisma/client';
import type { UserPreferences } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
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
   * Supprime définitivement le compte et toutes les données associées.
   *
   * Seule une poignée de relations (RefreshToken, PasswordResetToken, Visit,
   * SavedPlace, EarnedBadge, Streak, GroupMember) ont un onDelete: Cascade
   * déclaré dans le schéma — pour tout le reste (posts, stories, likes,
   * commentaires, mutes, blocages, conversations…) le champ `userId` est une
   * colonne brute sans relation Prisma : `user.delete()` seul les laisserait
   * orphelins en base (aucune erreur, mais des données jamais nettoyées,
   * contraire à ce qu'on promet dans l'app : « toutes tes données seront
   * effacées »). On nettoie donc explicitement chaque table concernée avant
   * de supprimer l'utilisateur, dans une transaction pour rester atomique.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction([
      // Interactions de cet utilisateur sur du contenu qui ne lui appartient
      // pas (ses propres posts/stories seront supprimés juste après et
      // entraîneront en cascade ses propres PostLike/PostComment/etc. via
      // postId — mais pas ses likes/commentaires sur les posts des autres).
      this.prisma.postLike.deleteMany({ where: { userId } }),
      this.prisma.commentLike.deleteMany({ where: { userId } }),
      this.prisma.postComment.deleteMany({ where: { userId } }),
      this.prisma.postSave.deleteMany({ where: { userId } }),
      this.prisma.repost.deleteMany({ where: { userId } }),
      this.prisma.storyView.deleteMany({ where: { userId } }),
      this.prisma.storyPollVote.deleteMany({ where: { userId } }),

      // Contenu possédé par l'utilisateur (cascade vers PostLike/PostComment/
      // PostSave/Repost/StoryView/StoryPollVote/StoryHighlightItem restants).
      this.prisma.post.deleteMany({ where: { userId } }),
      this.prisma.story.deleteMany({ where: { userId } }),
      this.prisma.storyHighlight.deleteMany({ where: { userId } }),
      this.prisma.savedCollection.deleteMany({ where: { userId } }),
      this.prisma.placeReview.deleteMany({ where: { userId } }),
      this.prisma.note.deleteMany({ where: { userId } }),
      this.prisma.userQuest.deleteMany({ where: { userId } }),
      this.prisma.meetupRsvp.deleteMany({ where: { userId } }),
      this.prisma.conversationParticipant.deleteMany({ where: { userId } }),
      this.prisma.messageReaction.deleteMany({ where: { userId } }),

      // Graphe social — relations dirigées dans les deux sens (l'utilisateur
      // a mute/bloqué/mis en ami proche/favori quelqu'un, ou l'inverse).
      this.prisma.mute.deleteMany({ where: { OR: [{ userId }, { mutedId: userId }] } }),
      this.prisma.restrict.deleteMany({ where: { OR: [{ userId }, { restrictedId: userId }] } }),
      this.prisma.closeFriend.deleteMany({ where: { OR: [{ userId }, { friendId: userId }] } }),
      this.prisma.favoriteUser.deleteMany({ where: { OR: [{ userId }, { favoriteId: userId }] } }),

      // Registres financiers (billets, réservations guide, commandes de la
      // boutique) : conservés pour la comptabilité mais anonymisés. Le schéma
      // ferait déjà passer `Order.userId` à NULL (onDelete: SetNull) ; c'est
      // écrit ici pour que la règle se lise au même endroit que les autres.
      this.prisma.ticket.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.guideBooking.updateMany({ where: { userId }, data: { userId: null } }),
      this.prisma.order.updateMany({ where: { userId }, data: { userId: null } }),

      // Révoque toutes les sessions actives avant de supprimer le compte
      // (redondant avec le cascade du schéma, gardé explicite par clarté).
      this.prisma.refreshToken.deleteMany({ where: { userId } }),

      this.prisma.user.delete({ where: { id: userId } }),
    ]);
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
    isPrivate: (user as any).isPrivate ?? false,
    shareVisits: user.shareVisits,
    shareEncounters: user.shareEncounters,
    mapAudience: user.mapAudience as PublicUser['mapAudience'],
    encounterAudience: user.encounterAudience as PublicUser['encounterAudience'],
    isAdmin: (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).includes(user.email.toLowerCase()),
  };
}
