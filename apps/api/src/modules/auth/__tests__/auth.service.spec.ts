import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService, DELETED_REPORTER_ID } from '../auth.service';
import { StorageService } from '../../../infra/storage/storage.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { MailerService } from '../../mailer/mailer.service';

// ── External JWT / OAuth mocks ────────────────────────────────────────────────
// jest.mock is hoisted — must not reference variables declared in this file.

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email: 'google@example.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://pic.example.com/g.jpg',
        sub: 'google-sub-123',
      }),
    }),
  })),
}));

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue({}),
  jwtVerify: jest.fn().mockResolvedValue({
    payload: { sub: 'apple-sub-456', email: 'apple@privaterelay.appleid.com' },
  }),
}));

/**
 * Date de naissance d'un majeur, recalculee a chaque execution : une date en
 * dur finirait par devenir fausse le jour ou la personne « vieillit ».
 */
const ADULT_BIRTH_DATE = `${new Date().getUTCFullYear() - 30}-01-01`;
/** Quinze ans revolus : juste sous la barriere. */
const MINOR_BIRTH_DATE = `${new Date().getUTCFullYear() - 15}-01-01`;

const mockUser = {
  id: 'user-1',
  email: 'test@yumia.app',
  displayName: 'Test User',
  bio: null,
  passwordHash: '$2a$12$hashedpassword',
  authProvider: 'password',
  appleId: null,
  photoUrl: null,
  locale: 'fr',
  currency: 'EUR',
  countryCode: null,
  timezone: null,
  plan: 'free',
  totalXp: 0,
  level: 1,
  preferences: {},
  expoPushToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRefreshTokenRecord = {
  id: 'rt-1',
  userId: 'user-1',
  tokenHash: 'hashed-token',
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  createdAt: new Date(),
  user: mockUser,
};

/**
 * Modèles explicitement mockés : ceux sur lesquels les tests posent des
 * assertions. Tous les autres sont créés à la volée par le Proxy ci-dessous.
 */
const explicitModels: any = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordResetToken: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

/**
 * `deleteAccount` balaie une vingtaine de tables (posts, likes, stories,
 * conversations…). Les lister une à une ici condamnait le test à casser à
 * chaque nouveau modèle ajouté au nettoyage — c'est exactement ce qui était
 * arrivé. Le Proxy fabrique donc un mock générique pour tout modèle non
 * déclaré, et le mémorise pour que deux accès renvoient le même objet
 * (indispensable pour `expect(...).toHaveBeenCalled()`).
 */
// Prisma accepte deux formes : `$transaction(callback)` et `$transaction([...])`.
// `deleteAccount` utilise la seconde ; d'autres méthodes la première. Défini une
// seule fois (et non recréé à chaque accès), sinon les assertions du type
// `expect(prismaMock.$transaction).toHaveBeenCalled()` porteraient sur un mock
// différent de celui réellement appelé.
const transactionMock = jest.fn((arg: unknown) =>
  typeof arg === 'function'
    ? (arg as (p: any) => any)(prismaMock)
    : Promise.all(arg as Promise<unknown>[]),
);

const prismaMock: any = new Proxy(explicitModels, {
  get(target, prop: string | symbol) {
    if (typeof prop === 'symbol' || prop === 'then') return undefined;
    if (prop === '$transaction') return transactionMock;
    if (!(prop in target)) {
      target[prop] = {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      };
    }
    return target[prop];
  },
});

const jwtMock = {
  sign: jest.fn().mockReturnValue('access-token'),
  signAsync: jest.fn().mockResolvedValue('access-token'),
};

/** Clé RevenueCat vue par le service — vide par défaut (aucun appel). */
let revenueCatKey = '';

const storageMock = { removeMany: jest.fn().mockResolvedValue(0) };

/** Client ioredis simulé : un SCAN qui trouve un compteur de quota. */
const redisRaw = {
  scan: jest.fn().mockResolvedValue(['0', ['quota:ai:u:user-1:2026-09-25']]),
  del: jest.fn().mockResolvedValue(1),
  zrange: jest.fn().mockResolvedValue([]),
  zrem: jest.fn(),
  get: jest.fn().mockResolvedValue(null),
  ttl: jest.fn().mockResolvedValue(-2),
  setex: jest.fn(),
};
const redisMock = { raw: redisRaw };

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, any> = {
      jwt: { accessSecret: 'test-secret', refreshSecret: 'test-refresh-secret', accessTtl: 900, refreshTtl: 2592000 },
      google: { clientId: 'test-google-client-id.apps.googleusercontent.com', audiences: ['test-google-client-id.apps.googleusercontent.com'] },
      apple: { audiences: ['com.yumia.app'] },
      revenuecat: { secretApiKey: revenueCatKey },
    };
    return cfg[key];
  }),
};

const mailerMock = {
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: MailerService, useValue: mailerMock },
        { provide: StorageService, useValue: storageMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('crée un compte et retourne les tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockUser);
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.register('test@yumia.app', 'password123', 'Test User', ADULT_BIRTH_DATE, 'fr');

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@yumia.app',
            displayName: 'Test User',
            authProvider: 'password',
          }),
        }),
      );
      expect(result.user.id).toBe('user-1');
      expect(result.tokens.accessToken).toBe('access-token');
      expect(mailerMock.sendWelcome).toHaveBeenCalledWith('test@yumia.app', 'Test User');
    });

    it('normalise l\'email en minuscule', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ ...mockUser, email: 'test@yumia.app' });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      await service.register('  TEST@YUMIA.APP  ', 'password123', 'Test User', ADULT_BIRTH_DATE);

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@yumia.app' },
      });
    });

    it('lève ConflictException si l\'email est déjà utilisé', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register('test@yumia.app', 'password123', 'Test User', ADULT_BIRTH_DATE),
      ).rejects.toThrow(ConflictException);
    });

    it('refuse une inscription sous la barriere dage, sans rien creer', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.register('kid@yumia.app', 'password123', 'Kid', MINOR_BIRTH_DATE),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('refuse une date de naissance absente ou inexistante', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.register('a@yumia.app', 'password123', 'A', '')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.register('b@yumia.app', 'password123', 'B', '2000-02-31'),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('enregistre l annee de naissance, et elle seule', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(mockUser);
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      await service.register('ok@yumia.app', 'password123', 'Ok', '1994-08-23');

      const data = prismaMock.user.create.mock.calls[0][0].data;
      expect(data.birthYear).toBe(1994);
      expect(data).not.toHaveProperty('birthDate');
    });
  });

  describe('login', () => {
    it('retourne les tokens si les identifiants sont valides', async () => {
      const hash = await bcrypt.hash('correctpassword', 4);
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login('test@yumia.app', 'correctpassword');

      expect(result.user.email).toBe('test@yumia.app');
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('lève UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.login('unknown@yumia.app', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lève UnauthorizedException si le mot de passe est incorrect', async () => {
      const hash = await bcrypt.hash('correctpassword', 4);
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

      await expect(service.login('test@yumia.app', 'wrongpassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('ne distingue pas "utilisateur inconnu" de "mauvais mdp" (anti-énumération)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      let err1: Error | null = null;
      try { await service.login('a@b.com', 'x'); } catch (e) { err1 = e as Error; }

      const hash = await bcrypt.hash('good', 4);
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
      let err2: Error | null = null;
      try { await service.login('test@yumia.app', 'bad'); } catch (e) { err2 = e as Error; }

      expect(err1?.message).toBe(err2?.message);
    });
  });

  describe('compte suspendu', () => {
    it('refuse la connexion et dit pourquoi', async () => {
      const hash = await bcrypt.hash('correctpassword', 4);
      const future = new Date(Date.now() + 86400000);
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
        suspendedUntil: future,
        suspendedReason: 'Propos haineux',
      });

      await expect(service.login('test@yumia.app', 'correctpassword')).rejects.toThrow(ForbiddenException);
    });

    it('laisse entrer quand la suspension est terminee', async () => {
      const hash = await bcrypt.hash('correctpassword', 4);
      const past = new Date(Date.now() - 86400000);
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hash,
        suspendedUntil: past,
        suspendedReason: 'Ancienne sanction',
      });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login('test@yumia.app', 'correctpassword');
      expect(result.tokens.accessToken).toBe('access-token');
    });
  });

  describe('refresh', () => {
    it("refuse de renouveler la session d'un compte suspendu", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshTokenRecord,
        user: { ...mockRefreshTokenRecord.user, suspendedUntil: new Date(Date.now() + 86400000), suspendedReason: 'Spam' },
      });
      prismaMock.refreshToken.update.mockResolvedValue({});

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(ForbiddenException);
    });

    it('rotation : révoque l\'ancien token et émet une nouvelle paire', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(mockRefreshTokenRecord);
      prismaMock.refreshToken.update.mockResolvedValue({});
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refresh('raw-refresh-token');

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(result.accessToken).toBe('access-token');
    });

    it('lève UnauthorizedException si le token est révoqué', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshTokenRecord,
        revokedAt: new Date(),
      });

      await expect(service.refresh('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('lève UnauthorizedException si le token est expiré', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshTokenRecord,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('lève UnauthorizedException si le token est inconnu', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('révoque le refresh token (idempotent)', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('some-refresh-token');

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('ne lève pas d\'erreur si le token est déjà révoqué', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.logout('already-revoked')).resolves.not.toThrow();
    });

    // Un téléphone déconnecté ne doit plus recevoir les notifications du compte.
    it('efface le jeton push du compte', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({ userId: 'user-1' });

      await service.logout('some-refresh-token');

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { expoPushToken: null },
      });
    });

    it("n'efface que le jeton de cet appareil quand l'app le fournit", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({ userId: 'user-1' });

      await service.logout('some-refresh-token', 'ExponentPushToken[device-a]');

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', expoPushToken: 'ExponentPushToken[device-a]' },
        data: { expoPushToken: null },
      });
    });

    it('ne touche à aucun compte pour un refresh token inconnu', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await service.logout('unknown-refresh-token');

      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('retourne le profil public de l\'utilisateur', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.me('user-1');

      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@yumia.app');
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('lève UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.me('non-existent')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('ne lève pas d\'erreur si l\'email est inconnu (anti-énumération)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword('unknown@yumia.app')).resolves.toBeUndefined();
      expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('crée un OTP et envoie l\'email si l\'utilisateur existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

      await expect(service.forgotPassword('test@yumia.app')).resolves.toBeUndefined();
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPassword', () => {
    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sha = (v: string) => require('node:crypto').createHash('sha256').update(v).digest('hex');
    const pending = (over: Record<string, unknown> = {}) => ({
      id: 'prt-1', userId: 'user-1', tokenHash: sha('123456'), expiresAt: futureExpiry, usedAt: null, attempts: 0, ...over,
    });

    it('réinitialise le mot de passe avec le bon e-mail et le bon code', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.passwordResetToken.findFirst.mockResolvedValue(pending());
      prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

      await expect(service.resetPassword('test@yumia.app', '123456', 'NewPass99!')).resolves.toBeUndefined();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // La demande cherchée est celle de CE compte, encore valable.
      expect(prismaMock.passwordResetToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', usedAt: null }),
      }));
      // Le nouveau hash de mot de passe est persisté et le provider repasse à 'password'.
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ passwordHash: expect.any(String), authProvider: 'password' }),
        }),
      );
      // Garantie de sécurité : toutes les sessions actives (refresh tokens) sont révoquées.
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // L'OTP est marqué comme utilisé (usage unique).
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prt-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });

    it('refuse un compte inconnu', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('x@yumia.app', '123456', 'NewPass99!')).rejects.toThrow(BadRequestException);
    });

    it("refuse quand aucune demande valable n'existe (expirée ou utilisée)", async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('test@yumia.app', '123456', 'NewPass99!')).rejects.toThrow(BadRequestException);
    });

    it('compte un code faux sans changer le mot de passe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.passwordResetToken.findFirst.mockResolvedValue(pending({ attempts: 1 }));

      await expect(service.resetPassword('test@yumia.app', '000000', 'NewPass99!')).rejects.toThrow(BadRequestException);
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({ where: { id: 'prt-1' }, data: { attempts: 2 } });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('annule la demande au 5e code faux (anti force brute)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.passwordResetToken.findFirst.mockResolvedValue(pending({ attempts: 4 }));

      await expect(service.resetPassword('test@yumia.app', '000000', 'NewPass99!')).rejects.toThrow(BadRequestException);
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' }, data: { attempts: 5, usedAt: expect.any(Date) },
      });
    });
  });

  describe('updateProfile', () => {
    it('met à jour displayName et retourne le profil public', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, displayName: 'Nouveau Nom' });

      const result = await service.updateProfile('user-1', { displayName: 'Nouveau Nom' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayName: 'Nouveau Nom' }) }),
      );
      expect(result.displayName).toBe('Nouveau Nom');
    });

    it('convertit une bio vide en null', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, bio: null });

      await service.updateProfile('user-1', { bio: '   ' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ bio: null }) }),
      );
    });

    it('garde la bio non vide après trim', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, bio: 'Passionné de gastronomie.' });

      await service.updateProfile('user-1', { bio: '  Passionné de gastronomie.  ' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ bio: 'Passionné de gastronomie.' }) }),
      );
    });

    it('fusionne les préférences sans écraser les clés existantes', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        preferences: { notifDigest: true, notifStreak: false },
      });
      prismaMock.user.update.mockResolvedValue({
        ...mockUser,
        preferences: { notifDigest: true, notifStreak: false, onboardingComplete: true },
      });

      await service.updateProfile('user-1', { preferences: { onboardingComplete: true } });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferences: expect.objectContaining({
              notifDigest: true,
              notifStreak: false,
              onboardingComplete: true,
            }),
          }),
        }),
      );
    });

    it('lève UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('unknown', { displayName: 'X' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deleteAccount', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', displayName: 'Test User', photoUrl: null });
      prismaMock.user.delete = jest.fn().mockResolvedValue(mockUser);
      storageMock.removeMany.mockResolvedValue(0);
      revenueCatKey = '';
    });

    it('refuse un compte inexistant', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.deleteAccount('ghost')).rejects.toThrow(UnauthorizedException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('révoque d\'abord tous les refresh tokens puis supprime le compte', async () => {
      prismaMock.refreshToken.deleteMany = jest.fn().mockResolvedValue({ count: 2 });

      await service.deleteAccount('user-1');

      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('révoque les tokens avant de supprimer (ordre garanti)', async () => {
      const order: string[] = [];
      prismaMock.refreshToken.deleteMany = jest.fn().mockImplementation(() => {
        order.push('revoke');
        return Promise.resolve({ count: 1 });
      });
      prismaMock.user.delete = jest.fn().mockImplementation(() => {
        order.push('delete');
        return Promise.resolve(mockUser);
      });

      await service.deleteAccount('user-1');

      expect(order).toEqual(['revoke', 'delete']);
    });

    // Une commande est une pièce comptable (dix ans de conservation) : la
    // supprimer avec le compte effaçait des factures, et une commande payée
    // mais pas encore transmise à AliExpress n'aurait jamais été expédiée.
    it('conserve les commandes en les détachant du compte, sans les supprimer', async () => {
      prismaMock.order.updateMany = jest.fn().mockResolvedValue({ count: 3 });
      prismaMock.order.deleteMany = jest.fn();

      await service.deleteAccount('user-1');

      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { userId: null },
      });
      expect(prismaMock.order.deleteMany).not.toHaveBeenCalled();
    });

    it('efface le graphe social dans les deux sens et ses messages envoyés', async () => {
      await service.deleteAccount('user-1');

      expect(prismaMock.follow.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ followerId: 'user-1' }, { followingId: 'user-1' }] },
      });
      expect(prismaMock.followRequest.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ requesterId: 'user-1' }, { targetId: 'user-1' }] },
      });
      expect(prismaMock.block.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ blockerId: 'user-1' }, { blockedId: 'user-1' }] },
      });
      expect(prismaMock.encounter.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ userAId: 'user-1' }, { userBId: 'user-1' }] },
      });
      expect(prismaMock.message.deleteMany).toHaveBeenCalledWith({ where: { senderId: 'user-1' } });
      expect(prismaMock.meetupEvent.deleteMany).toHaveBeenCalledWith({ where: { hostId: 'user-1' } });
      expect(prismaMock.groupSession.updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1' },
        data: { createdById: null },
      });
    });

    it('anonymise ses signalements et retire son id des publications d\'autrui', async () => {
      prismaMock.post.findMany = jest.fn().mockImplementation((args: any) =>
        Promise.resolve(args?.where?.taggedUserIds ? [{ id: 'p-other', taggedUserIds: ['user-1', 'user-9'] }] : []),
      );

      await service.deleteAccount('user-1');

      expect(prismaMock.report.updateMany).toHaveBeenCalledWith({
        where: { reporterId: 'user-1' },
        data: { reporterId: DELETED_REPORTER_ID },
      });
      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 'p-other' },
        data: { taggedUserIds: ['user-9'] },
      });
      expect(prismaMock.post.updateMany).toHaveBeenCalledWith({
        where: { collabUserId: 'user-1' },
        data: { collabUserId: null },
      });
      prismaMock.post.findMany = jest.fn().mockResolvedValue([]);
    });

    it('retire ses j\'aime des compteurs des publications d\'autrui', async () => {
      prismaMock.postLike.findMany = jest.fn().mockResolvedValue([{ postId: 'p-1' }, { postId: 'p-2' }]);

      await service.deleteAccount('user-1');

      expect(prismaMock.post.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p-1', 'p-2'] }, likesCount: { gt: 0 } },
        data: { likesCount: { decrement: 1 } },
      });
      prismaMock.postLike.findMany = jest.fn().mockResolvedValue([]);
    });

    it('transfère un groupe qu\'il a créé et supprime les conversations vidées', async () => {
      prismaMock.conversationParticipant.findMany = jest.fn().mockResolvedValue([
        { conversationId: 'c-group' },
        { conversationId: 'c-alone' },
      ]);
      prismaMock.conversation.findMany = jest.fn().mockResolvedValue([
        { id: 'c-group', creatorId: 'user-1', participants: [{ userId: 'user-1' }, { userId: 'user-7' }] },
        { id: 'c-alone', creatorId: null, participants: [{ userId: 'user-1' }] },
      ]);

      await service.deleteAccount('user-1');

      expect(prismaMock.conversation.update).toHaveBeenCalledWith({ where: { id: 'c-group' }, data: { creatorId: 'user-7' } });
      expect(prismaMock.conversation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c-alone'] } } });
      prismaMock.conversationParticipant.findMany = jest.fn().mockResolvedValue([]);
    });

    it('efface ses fichiers APRÈS la transaction, et ses clés Redis', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', displayName: 'Test User', photoUrl: 'https://api/uploads/avatars/user-1_a.jpg' });
      prismaMock.story.findMany = jest.fn().mockImplementation((args: any) =>
        Promise.resolve(args?.select?.mediaUrl ? [{ mediaUrl: 'https://api/uploads/posts/user-1_s.mp4', musicTrack: null }] : []),
      );

      await service.deleteAccount('user-1');

      expect(storageMock.removeMany).toHaveBeenCalledWith(
        expect.arrayContaining(['https://api/uploads/avatars/user-1_a.jpg', 'https://api/uploads/posts/user-1_s.mp4']),
        'user-1',
      );
      expect(storageMock.removeMany.mock.invocationCallOrder[0]).toBeGreaterThan(transactionMock.mock.invocationCallOrder[0]);
      expect(redisRaw.del.mock.calls[0]).toEqual(expect.arrayContaining([
        'user:loc:user-1', 'user:enc:user-1', 'social:intent:user-1', 'swipe:seen:user-1', 'saved:ids:user-1',
        'quota:ai:u:user-1:2026-09-25',
      ]));
      prismaMock.story.findMany = jest.fn().mockResolvedValue([]);
    });

    it('supprime le client RevenueCat quand la clé secrète est configurée', async () => {
      revenueCatKey = 'sk_test';
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as unknown as typeof fetch;

      await service.deleteAccount('user-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenuecat.com/v1/subscribers/user-1',
        expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }) }),
      );
    });

    it('n\'échoue pas si le stockage, Redis ou RevenueCat sont en panne', async () => {
      revenueCatKey = 'sk_test';
      global.fetch = jest.fn().mockRejectedValue(new Error('réseau')) as unknown as typeof fetch;
      storageMock.removeMany.mockRejectedValue(new Error('disque'));
      redisRaw.scan.mockRejectedValueOnce(new Error('redis'));

      await expect(service.deleteAccount('user-1')).resolves.toBeUndefined();
      expect(prismaMock.user.delete).toHaveBeenCalled();
    });
  });

  describe('exportData', () => {
    it('retourne le profil, les visites et les lieux sauvegardés', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@yumia.app', displayName: 'Test', locale: 'fr',
        currency: 'EUR', countryCode: null, plan: 'free', totalXp: 0, level: 1, createdAt: new Date(),
        gender: 'female', birthYear: 1990, interestedIn: 'everyone', isPrivate: true,
      });
      prismaMock.visit = {
        findMany: jest.fn().mockResolvedValue([
          { id: 'v-1', placeId: 'place-1', feedback: 'loved', notes: null, visitedAt: new Date() },
        ]),
      };
      prismaMock.savedPlace = {
        findMany: jest.fn().mockResolvedValue([
          { placeId: 'place-2', createdAt: new Date() },
        ]),
      };

      const result = await service.exportData('user-1');

      expect(result).toHaveProperty('exportedAt');
      expect(result.profile).toMatchObject({ id: 'user-1', email: 'test@yumia.app', gender: 'female', birthYear: 1990 });
      expect(Array.isArray(result.visits)).toBe(true);
      expect(Array.isArray(result.savedPlaces)).toBe(true);
    });

    it('exporte messages, abonnements, commandes et le reste des données personnelles', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@yumia.app', totalXp: 120, level: 2 });
      prismaMock.message.findMany = jest.fn().mockResolvedValue([{ id: 'm-1', conversationId: 'c-1', content: 'salut', createdAt: new Date() }]);
      prismaMock.follow.findMany = jest.fn().mockResolvedValue([{ followingId: 'user-2', createdAt: new Date() }]);
      prismaMock.order.findMany = jest.fn().mockResolvedValue([{ reference: 'YUM-1', addressSnapshot: { city: 'Paris' } }]);

      const result: any = await service.exportData('user-1');

      expect(prismaMock.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { senderId: 'user-1' },
        take: 5000,
      }));
      expect(result.messages).toHaveLength(1);
      expect(result.social.following).toHaveLength(1);
      expect(result.shop.orders[0].reference).toBe('YUM-1');
      expect(result.gamification).toMatchObject({ xp: 120, level: 2 });
      for (const key of ['posts', 'comments', 'likes', 'saves', 'stories', 'highlights', 'calendarEvents', 'notebookNotes', 'itineraries', 'placeReviews', 'notifications']) {
        expect(result).toHaveProperty(key);
      }
      prismaMock.message.findMany = jest.fn().mockResolvedValue([]);
      prismaMock.follow.findMany = jest.fn().mockResolvedValue([]);
      prismaMock.order.findMany = jest.fn().mockResolvedValue([]);
    });

    it('retourne des tableaux vides si l\'utilisateur n\'a aucune donnée', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@yumia.app', displayName: 'Test', locale: 'fr',
        currency: 'EUR', countryCode: null, plan: 'free', totalXp: 0, level: 1, createdAt: new Date(),
      });
      prismaMock.visit = { findMany: jest.fn().mockResolvedValue([]) };
      prismaMock.savedPlace = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await service.exportData('user-1');

      expect(result.visits).toHaveLength(0);
      expect(result.savedPlaces).toHaveLength(0);
    });
  });

  describe('loginWithGoogle', () => {
    it('crée un nouveau compte Google et retourne les tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        ...mockUser,
        email: 'google@example.com',
        authProvider: 'google',
        photoUrl: 'https://pic.example.com/g.jpg',
      });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.loginWithGoogle('valid-id-token', ADULT_BIRTH_DATE);

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'google@example.com', authProvider: 'google' }),
        }),
      );
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('refuse de CREER un compte Google sans date de naissance', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.loginWithGoogle('valid-id-token')).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('relie le compte Google à un compte password existant', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, email: 'google@example.com', authProvider: 'password' });
      prismaMock.user.update.mockResolvedValue({ ...mockUser, email: 'google@example.com', authProvider: 'google' });
      prismaMock.$transaction.mockResolvedValue([{ ...mockUser, email: 'google@example.com', authProvider: 'google' }, { count: 1 }]);
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.loginWithGoogle('valid-id-token');

      // Le mot de passe posé à l'inscription (e-mail jamais vérifié) est effacé
      // et les sessions ouvertes sont coupées : un inconnu ne peut pas avoir
      // pré-créé le compte pour y rester une fois l'identité Google rattachée.
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authProvider: 'google', passwordHash: null }) }),
      );
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: mockUser.id, revokedAt: null } }),
      );
      expect(result.user.email).toBe('google@example.com');
    });

    it('refuse une adresse Google non vérifiée', async () => {
      const { OAuth2Client } = jest.requireMock('google-auth-library');
      OAuth2Client.mockImplementationOnce(() => ({
        verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => ({ email: 'x@example.com', email_verified: false }) }),
      }));
      await expect(service.loginWithGoogle('valid-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('lève UnauthorizedException si Google OAuth n\'est pas configuré', async () => {
      const noGoogleConfig = {
        get: jest.fn((key: string) => {
          const cfg: Record<string, any> = {
            jwt: configMock.get('jwt'),
            google: { clientId: '', audiences: [] }, // pas de clientId
          };
          return cfg[key];
        }),
      };
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: JwtService, useValue: jwtMock },
          { provide: ConfigService, useValue: noGoogleConfig },
          { provide: MailerService, useValue: mailerMock },
          { provide: StorageService, useValue: storageMock },
          { provide: RedisService, useValue: redisMock },
        ],
      }).compile();
      const svc = module.get(AuthService);

      await expect(svc.loginWithGoogle('some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('lève UnauthorizedException si le token Google est invalide', async () => {
      const { OAuth2Client } = jest.requireMock('google-auth-library');
      (OAuth2Client as jest.Mock).mockImplementationOnce(() => ({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('invalid token')),
      }));

      await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginWithApple', () => {
    it('crée un nouveau compte Apple et retourne les tokens', async () => {
      prismaMock.user.findFirst = jest.fn().mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        ...mockUser,
        email: 'apple@privaterelay.appleid.com',
        authProvider: 'apple',
        appleId: 'apple-sub-456',
      });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.loginWithApple(
        'valid-identity-token',
        'apple-sub-456',
        'Apple User',
        ADULT_BIRTH_DATE,
      );

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ authProvider: 'apple', appleId: 'apple-sub-456' }),
        }),
      );
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('refuse de CREER un compte Apple sans date de naissance', async () => {
      prismaMock.user.findFirst = jest.fn().mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginWithApple('valid-identity-token', 'apple-sub-456', 'Apple User'),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it("refuse un appleUserId qui n'est pas celui signé par Apple", async () => {
      prismaMock.user.findFirst = jest.fn();
      await expect(service.loginWithApple('valid-identity-token', 'someone-else')).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('retrouve l\'utilisateur par appleId et retourne les tokens', async () => {
      const appleUser = { ...mockUser, authProvider: 'apple', appleId: 'apple-sub-456' };
      prismaMock.user.findFirst = jest.fn().mockResolvedValue(appleUser);
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.loginWithApple('valid-identity-token', 'apple-sub-456');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({ where: { appleId: 'apple-sub-456' } });
      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('user-1');
    });

    it('lève UnauthorizedException si le token Apple est invalide', async () => {
      const { jwtVerify } = jest.requireMock('jose');
      (jwtVerify as jest.Mock).mockRejectedValueOnce(new Error('invalid signature'));

      await expect(
        service.loginWithApple('bad-token', 'apple-sub-456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
