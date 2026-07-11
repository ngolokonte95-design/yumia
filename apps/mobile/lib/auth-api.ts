/**
 * Client des endpoints d'authentification (`/auth/*`).
 * Miroir des contrats renvoyés par `apps/api` (module `auth`).
 */
import { request } from './api';
import { API_BASE_URL } from './config';
import type { Universe } from '@yumia/shared';
export type { Universe };

export interface UserPreferences {
  favoriteUniverses?: Universe[];
  restrictions?: string[];
  onboardingComplete?: boolean;
  notifDigest?: boolean;
  notifStreak?: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  authProvider: 'password' | 'google' | 'apple';
  locale: string;
  currency: string;
  countryCode: string | null;
  plan: 'free' | 'plus';
  isPremium: boolean;
  premiumPlan: string | null;
  totalXp: number;
  level: number;
  preferences: UserPreferences;
  createdAt: string;
  gender: string | null;
  birthYear: number | null;
  interestedIn: string;
  isAdmin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export function registerRequest(input: {
  email: string;
  password: string;
  displayName: string;
  locale?: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', { method: 'POST', body: input });
}

export function loginRequest(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', { method: 'POST', body: { email, password } });
}

export function refreshRequest(refreshToken: string): Promise<AuthTokens> {
  return request<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken } });
}

export function logoutRequest(refreshToken: string): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST', body: { refreshToken } });
}

export function meRequest(accessToken: string): Promise<PublicUser> {
  return request<PublicUser>('/auth/me', { token: accessToken });
}

export function updateProfileRequest(
  accessToken: string,
  patch: { displayName?: string; bio?: string; locale?: string; preferences?: UserPreferences; gender?: string; birthYear?: number; interestedIn?: string; photoUrl?: string },
): Promise<PublicUser> {
  return request<PublicUser>('/auth/me', { method: 'PATCH', body: patch, token: accessToken });
}

export function googleAuthRequest(idToken: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/google', { method: 'POST', body: { idToken } });
}

export function appleAuthRequest(
  identityToken: string,
  appleUserId: string,
  displayName?: string,
): Promise<AuthResult> {
  return request<AuthResult>('/auth/apple', {
    method: 'POST',
    body: { identityToken, appleUserId, displayName },
  });
}

export function forgotPasswordRequest(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } });
}

export function resetPasswordRequest(token: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
}

export function deleteAccountRequest(accessToken: string): Promise<void> {
  return request<void>('/auth/me', { method: 'DELETE', token: accessToken });
}

/** Active le Premium côté serveur après un achat RevenueCat validé. */
export function activatePremiumRequest(
  accessToken: string,
  plan: 'monthly' | 'annual',
): Promise<PublicUser> {
  return request<PublicUser>('/auth/premium/activate', {
    method: 'POST',
    body: { plan },
    token: accessToken,
  });
}

/** Désactive le Premium côté serveur (annulation / expiration). */
export function deactivatePremiumRequest(accessToken: string): Promise<PublicUser> {
  return request<PublicUser>('/auth/premium/deactivate', {
    method: 'POST',
    token: accessToken,
  });
}

export function exportDataRequest(accessToken: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/auth/me/export', { method: 'POST', token: accessToken });
}

export async function uploadAvatarRequest(
  accessToken: string,
  imageUri: string,
): Promise<{ photoUrl: string }> {
  const filename = imageUri.split('/').pop() ?? 'avatar.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime = mimeMap[ext] ?? 'image/jpeg';

  const form = new FormData();
  form.append('avatar', { uri: imageUri, name: filename, type: mime } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<{ photoUrl: string }>;
}
