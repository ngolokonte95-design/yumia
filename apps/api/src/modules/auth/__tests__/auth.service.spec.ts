import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { MailerService } from '../../mailer/mailer.service';

// ── External JWT / OAuth mocks ────────────────────────────────────────────────
// jest.mock is hoisted — must not reference variables declared in this file.

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email: 'google@example.com',
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

const prismaMock: any = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
  $transaction: jest.fn((fn: (p: any) => any) => fn(prismaMock)),
};

const jwtMock = {
  sign: jest.fn().mockReturnValue('access-token'),
  signAsync: jest.fn().mockResolvedValue('access-token'),
};

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, any> = {
      jwt: { accessSecret: 'test-secret', refreshSecret: 'test-refresh-secret', accessTtl: 900, refreshTtl: 2592000 },
      google: { clientId: 'test-google-client-id.apps.googleusercontent.com' },
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

      const result = await service.register('test@yumia.app', 'password123', 'Test User', 'fr');

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

      await service.register('  TEST@YUMIA.APP  ', 'password123', 'Test User');

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@yumia.app' },
      });
    });

    it('lève ConflictException si l\'email est déjà utilisé', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register('test@yumia.app', 'password123', 'Test User'),
      ).rejects.toThrow(ConflictException);
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

  describe('refresh', () => {
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

    it('réinitialise le mot de passe avec un OTP valide', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: futureExpiry,
        usedAt: null,
        user: mockUser,
      });
      prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

      await expect(service.resetPassword('123456', 'NewPass99!')).resolves.toBeUndefined();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

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

    it('lève BadRequestException si le token est expiré', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        user: mockUser,
      });

      await expect(service.resetPassword('123456', 'NewPass99!')).rejects.toThrow(BadRequestException);
    });

    it('lève BadRequestException si le token est déjà utilisé', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: futureExpiry,
        usedAt: new Date(),
        user: mockUser,
      });

      await expect(service.resetPassword('123456', 'NewPass99!')).rejects.toThrow(BadRequestException);
    });

    it('lève BadRequestException si le token est inconnu', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPass99!')).rejects.toThrow(BadRequestException);
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
    it('révoque d\'abord tous les refresh tokens puis supprime le compte', async () => {
      prismaMock.refreshToken.deleteMany = jest.fn().mockResolvedValue({ count: 2 });
      prismaMock.user.delete = jest.fn().mockResolvedValue(mockUser);

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
  });

  describe('exportData', () => {
    it('retourne le profil, les visites et les lieux sauvegardés', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@yumia.app', displayName: 'Test', locale: 'fr',
        currency: 'EUR', countryCode: null, plan: 'free', totalXp: 0, level: 1, createdAt: new Date(),
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
      expect(result.profile).toMatchObject({ id: 'user-1', email: 'test@yumia.app' });
      expect(Array.isArray(result.visits)).toBe(true);
      expect(Array.isArray(result.savedPlaces)).toBe(true);
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

      const result = await service.loginWithGoogle('valid-id-token');

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'google@example.com', authProvider: 'google' }),
        }),
      );
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('relie le compte Google à un compte password existant', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ ...mockUser, email: 'google@example.com', authProvider: 'password' });
      prismaMock.user.update.mockResolvedValue({ ...mockUser, email: 'google@example.com', authProvider: 'google' });
      prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.loginWithGoogle('valid-id-token');

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ authProvider: 'google' }) }),
      );
      expect(result.user.email).toBe('google@example.com');
    });

    it('lève UnauthorizedException si Google OAuth n\'est pas configuré', async () => {
      const noGoogleConfig = {
        get: jest.fn((key: string) => {
          const cfg: Record<string, any> = {
            jwt: configMock.get('jwt'),
            google: { clientId: '' }, // pas de clientId
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

      const result = await service.loginWithApple('valid-identity-token', 'apple-sub-456', 'Apple User');

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ authProvider: 'apple', appleId: 'apple-sub-456' }),
        }),
      );
      expect(result.tokens.accessToken).toBe('access-token');
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
