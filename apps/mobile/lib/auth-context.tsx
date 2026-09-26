/**
 * État d'authentification global : utilisateur courant, jetons, et actions
 * (login / register / logout). Bootstrap au démarrage depuis le stockage
 * sécurisé, avec rafraîchissement automatique du jeton si l'accès a expiré.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, refreshAccessTokenOnce, registerTokenRefresher, setCurrentAccessToken, unregisterTokenRefresher } from './api';
import { clearSentryUser, setSentryUser } from './sentry';
import { loginPurchases, logoutPurchases } from './purchases';
import {
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
import { currentPushToken } from './usePushNotifications';

/**
 * Le serveur a-t-il réellement refusé la session (jeton révoqué, expiré,
 * compte suspendu) ? Une erreur réseau ou un 5xx n'est PAS un refus : la
 * traiter comme tel déconnectait l'utilisateur à chaque lancement hors ligne,
 * et effaçait ses données locales avec.
 */
function isSessionRejected(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 403);
}
import { getCachedDeviceLocale } from './device-locale';
import { purgeUserData } from './user-data-purge';
import { stopSharingLocation } from './share-location';
import { clearUnreadCountLocally } from './useNotifications';
import { clearUnreadMessagesLocally } from './useUnreadMessages';

/** Borne un appel best-effort pour ne jamais bloquer la déconnexion. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.catch(() => {}).finally(() => { clearTimeout(timer); resolve(); });
  });
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  /** Jeton d'accès courant, pour les appels API protégés. */
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; birthDate: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; bio?: string; locale?: string; preferences?: UserPreferences; gender?: string; birthYear?: number; interestedIn?: string; photoUrl?: string }) => Promise<void>;
  applyAuthResult: (result: AuthResult) => Promise<void>;
  /** Recharge le profil depuis l'API — utile après un changement de plan (ex : RestorePurchases). */
  reloadUser: () => Promise<void>;
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
  // Copie lue par les routes publiques qui identifient l'appelant (lib/api).
  useEffect(() => { setCurrentAccessToken(accessToken); }, [accessToken]);


  const refreshTokenRef = useRef<string | null>(null);

  const applySession = useCallback(async (u: PublicUser, tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>) => {
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
      let fresh: Awaited<ReturnType<typeof refreshRequest>>;
      try {
        fresh = await refreshRequest(refreshTokenRef.current);
      } catch (err) {
        // Seul un refus du serveur met fin à la session. Sans réseau, on
        // garde tout : le prochain appel retentera le renouvellement.
        if (isSessionRejected(err)) await clearSessionRef.current?.();
        return null;
      }
      refreshTokenRef.current = fresh.refreshToken;
      await saveTokens(fresh);
      setAccessToken(fresh.accessToken);
      setRefreshToken(fresh.refreshToken);
      return fresh.accessToken;
    });
    setSentryUser(u.id);
    void loginPurchases(u.id);
  }, []);

  const clearSessionRef = useRef<(() => Promise<void>) | null>(null);
  const clearSession = useCallback(async () => {
    if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
    unregisterTokenRefresher();
    clearSentryUser();
    void logoutPurchases();
    refreshTokenRef.current = null;
    await clearTokens().catch(() => {});
    // Données locales du compte (cache, souvenirs, historique, quotas) : un
    // autre compte connecté ensuite sur ce téléphone ne doit pas en hériter.
    await purgeUserData();
    clearUnreadCountLocally();
    clearUnreadMessagesLocally();
    setRefreshToken(null);
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);
  clearSessionRef.current = clearSession;

  // Rafraîchissement proactif : renouvelle l'access token 60 s avant expiration.
  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const expMs = jwtExpiry(accessToken);
    if (!expMs) return;
    const delay = expMs - Date.now() - 60_000;
    if (delay <= 0) return;
    refreshTimer.current = setTimeout(async () => {
      // Même promesse partagée que le refresh sur 401 (api.ts) : le refresh
      // token est à usage unique, deux refresh concurrents déconnecteraient.
      // Le refresher enregistré par applySession sauvegarde et applique les
      // nouveaux jetons lui-même.
      // Un échec ici n'efface rien : un refus du serveur est déjà traité par
      // le refresher (fin de session), un échec réseau sera retenté au
      // prochain appel.
      await refreshAccessTokenOnce();
    }, delay);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [accessToken, refreshToken, clearSession]);

  // Bootstrap : restaure la session depuis le stockage sécurisé.
  useEffect(() => {
    let active = true;
    (async () => {
      // Keychain/Keystore illisible (appareil verrouillé au boot, stockage
      // corrompu…) : sans ce garde-fou l'app restait bloquée sur le splash
      // en 'loading'. On repart déconnecté.
      let stored: Awaited<ReturnType<typeof loadTokens>> = null;
      try {
        stored = await loadTokens();
      } catch {
        stored = null;
      }
      if (!stored) {
        if (active) setStatus('unauthenticated');
        return;
      }
      try {
        const me = await meRequest(stored.accessToken);
        // Même chemin qu'après un login : refresher sur 401, utilisateur
        // Sentry et identifiant RevenueCat (sinon un achat fait dans les
        // premières minutes part sur un id anonyme introuvable par le webhook).
        if (active) await applySession(me, stored);
      } catch (err) {
        // Accès expiré → on tente un rafraîchissement.
        let rejected = !(err instanceof ApiError && err.status === 401) && isSessionRejected(err);
        if (err instanceof ApiError && err.status === 401) {
          try {
            const tokens = await refreshRequest(stored.refreshToken);
            await saveTokens(tokens);
            const me = await meRequest(tokens.accessToken);
            if (active) await applySession(me, tokens);
            return;
          } catch (refreshErr) {
            rejected = isSessionRejected(refreshErr);
          }
        }
        if (!active) return;
        if (rejected) {
          await clearSession();
        } else {
          // Pas de réseau (ou serveur indisponible) au lancement : on ne
          // déconnecte pas et on n'efface rien. Écran de connexion pour cette
          // fois ; la session stockée sera reprise au prochain lancement.
          setStatus('unauthenticated');
        }
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
    async (input: { email: string; password: string; displayName: string; birthDate: string }) => {
      const res = await registerRequest(input);
      await applySession(res.user, res.tokens);
      // Synchronise vers le profil fraîchement créé la langue choisie sur
      // l'écran de sélection au premier lancement (device-locale.ts) — sans
      // ça l'inscription retomberait sur le 'fr' par défaut du serveur
      // malgré le choix explicite de l'utilisateur.
      const chosenLocale = getCachedDeviceLocale();
      if (chosenLocale && chosenLocale !== res.user.locale) {
        try {
          const updated = await updateProfileRequest(res.tokens.accessToken, { locale: chosenLocale });
          setUser((prev) => (prev ? { ...prev, locale: updated.locale } : prev));
        } catch {
          // best-effort : pas grave si ça échoue, changeable plus tard dans les paramètres
        }
      }
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    // Retire la position partagée AVANT d'effacer le jeton (il faut encore
    // être authentifié). Best-effort et borné : le TTL serveur de 10 min
    // finit le travail si le réseau manque.
    if (accessToken) await withTimeout(stopSharingLocation(accessToken), 3000);
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken, currentPushToken());
      } catch {
        // révocation best-effort ; on nettoie localement quoi qu'il arrive
      }
    }
    await clearSession();
  }, [accessToken, refreshToken, clearSession]);

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

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, accessToken, login, register, logout, updateProfile, applyAuthResult, reloadUser }),
    [status, user, accessToken, login, register, logout, updateProfile, applyAuthResult, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}

/**
 * Variante sans throw — renvoie `null` hors de <AuthProvider> au lieu de
 * planter. Réservée aux quelques endroits qui doivent rester rendables même
 * quand AuthProvider n'est pas monté (ex. ErrorBoundary, qui l'englobe et
 * doit pouvoir afficher son propre écran de repli si AuthProvider plante).
 */
export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext);
}
