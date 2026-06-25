/**
 * État d'authentification global : utilisateur courant, jetons, et actions
 * (login / register / logout). Bootstrap au démarrage depuis le stockage
 * sécurisé, avec rafraîchissement automatique du jeton si l'accès a expiré.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, registerTokenRefresher, unregisterTokenRefresher } from './api';
import { clearSentryUser, setSentryUser } from './sentry';
import { loginPurchases, logoutPurchases } from './purchases';
import {
  activatePremiumRequest,
  googleAuthRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  registerRequest,
  updateProfileRequest,
  type AuthResult,
  type AuthTokens,
  type PublicUser,
  type UserPreferences,
} from './auth-api';
import { clearTokens, loadTokens, saveTokens } from './token-storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  /** Jeton d'accès courant, pour les appels API protégés. */
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; bio?: string; locale?: string; preferences?: UserPreferences }) => Promise<void>;
  applyAuthResult: (result: AuthResult) => Promise<void>;
  /** Recharge le profil depuis l'API — utile après un changement de plan (ex : RestorePurchases). */
  reloadUser: () => Promise<void>;
  /** Active le Premium côté serveur (après achat RevenueCat) et met à jour l'état. */
  activatePremium: (plan: 'monthly' | 'annual') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback(async (u: PublicUser, tokens: AuthTokens) => {
    await saveTokens(tokens);
    refreshTokenRef.current = tokens.refreshToken;
    setRefreshToken(tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setUser(u);
    setStatus('authenticated');
    // Give api.ts a way to silently refresh on 401.
    // State setters (setAccessToken, setRefreshToken) are stable — safe to close over.
    registerTokenRefresher(async () => {
      if (!refreshTokenRef.current) return null;
      const fresh = await refreshRequest(refreshTokenRef.current);
      refreshTokenRef.current = fresh.refreshToken;
      await saveTokens(fresh);
      setAccessToken(fresh.accessToken);
      setRefreshToken(fresh.refreshToken);
      return fresh.accessToken;
    });
    setSentryUser(u.id, u.email);
    void loginPurchases(u.id);
  }, []);

  const clearSession = useCallback(async () => {
    if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
    unregisterTokenRefresher();
    clearSentryUser();
    void logoutPurchases();
    refreshTokenRef.current = null;
    await clearTokens();
    setRefreshToken(null);
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Rafraîchissement proactif : renouvelle l'access token 60 s avant expiration.
  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const expMs = jwtExpiry(accessToken);
    if (!expMs) return;
    const delay = expMs - Date.now() - 60_000;
    if (delay <= 0) return;
    refreshTimer.current = setTimeout(async () => {
      try {
        const tokens = await refreshRequest(refreshToken);
        const me = await meRequest(tokens.accessToken);
        await applySession(me, tokens);
      } catch {
        await clearSession();
      }
    }, delay);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [accessToken, refreshToken, applySession, clearSession]);

  // Bootstrap : restaure la session depuis le stockage sécurisé.
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadTokens();
      if (!stored) {
        if (active) setStatus('unauthenticated');
        return;
      }
      try {
        const me = await meRequest(stored.accessToken);
        if (active) {
          setRefreshToken(stored.refreshToken);
          setAccessToken(stored.accessToken);
          setUser(me);
          setStatus('authenticated');
        }
      } catch (err) {
        // Accès expiré → on tente un rafraîchissement.
        if (err instanceof ApiError && err.status === 401) {
          try {
            const tokens = await refreshRequest(stored.refreshToken);
            const me = await meRequest(tokens.accessToken);
            if (active) await applySession(me, tokens);
            return;
          } catch {
            // refresh KO → session invalide
          }
        }
        if (active) await clearSession();
      }
    })();
    return () => {
      active = false;
    };
  }, [applySession, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginRequest(email, password);
      await applySession(res.user, res.tokens);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const res = await registerRequest(input);
      await applySession(res.user, res.tokens);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // révocation best-effort ; on nettoie localement quoi qu'il arrive
      }
    }
    await clearSession();
  }, [refreshToken, clearSession]);

  const updateProfile = useCallback(
    async (patch: { displayName?: string; bio?: string; locale?: string; preferences?: UserPreferences }) => {
      if (!accessToken) throw new Error('Non authentifié.');
      const updated = await updateProfileRequest(accessToken, patch);
      // Fusion défensive : on garde les préférences renvoyées par l'API, mais on
      // réapplique celles qu'on vient d'envoyer si la réponse les omet (ex. build
      // d'API périmé qui retire un champ via whitelist). Sans ça, l'AuthGate
      // pourrait renvoyer à l'onboarding après "C'est parti !".
      setUser((prev) => ({
        ...updated,
        preferences: {
          ...(prev?.preferences ?? {}),
          ...(patch.preferences ?? {}),
          ...(updated.preferences ?? {}),
        },
      }));
    },
    [accessToken],
  );

  const applyAuthResult = useCallback(
    async (result: AuthResult) => {
      await applySession(result.user, result.tokens);
    },
    [applySession],
  );

  const reloadUser = useCallback(async () => {
    if (!accessToken) return;
    try {
      const updated = await meRequest(accessToken);
      setUser(updated);
    } catch {
      // silencieux — l'état courant reste inchangé
    }
  }, [accessToken]);

  const activatePremium = useCallback(
    async (plan: 'monthly' | 'annual') => {
      if (!accessToken) throw new Error('Non authentifié.');
      const updated = await activatePremiumRequest(accessToken, plan);
      setUser(updated);
    },
    [accessToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, accessToken, login, register, logout, updateProfile, applyAuthResult, reloadUser, activatePremium }),
    [status, user, accessToken, login, register, logout, updateProfile, applyAuthResult, reloadUser, activatePremium],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
