import type { Plan, AuthProvider } from '@prisma/client';
import type { UserPreferences } from '@yumia/shared';

/** Charge utile signée dans le JWT d'accès. */
export interface JwtPayload {
  /** ID utilisateur (subject). */
  sub: string;
  email: string;
}

/** Paire de jetons renvoyée à la connexion / inscription / rafraîchissement. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Durée de vie de l'access token en secondes. */
  expiresIn: number;
}

/** Vue publique d'un utilisateur (jamais de `passwordHash`). */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  authProvider: AuthProvider;
  locale: string;
  currency: string;
  countryCode: string | null;
  plan: Plan;
  isPremium: boolean;
  premiumPlan: string | null;
  totalXp: number;
  level: number;
  preferences: UserPreferences;
  createdAt: Date;
}

/** Réponse d'authentification : utilisateur + jetons. */
export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}
