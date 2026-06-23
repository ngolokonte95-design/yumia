/**
 * Sentry wrapper for the YUMIA mobile app.
 *
 * All calls are no-ops when @sentry/react-native is not installed or when
 * EXPO_PUBLIC_SENTRY_DSN is not set, so local development is unaffected.
 *
 * Installation:
 *   npm install @sentry/react-native --workspace=@yumia/mobile
 *   # Then add the Expo plugin in app.json:
 *   #   "plugins": [..., "@sentry/react-native/expo"]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SentryInstance = Record<string, any>;

let _sentry: SentryInstance | null = null;

function getSentry(): SentryInstance | null {
  if (_sentry !== null) return _sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sentry = require('@sentry/react-native') as SentryInstance;
  } catch {
    _sentry = null;
  }
  return _sentry;
}

/**
 * Call once at app startup (before the root component mounts).
 * Safe to call when DSN is not configured — returns immediately.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const Sentry = getSentry();
  if (!Sentry) return;

  Sentry['init']({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 1.0 : 0.15,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 10_000,
    attachStacktrace: true,
  });
}

/** Capture an unexpected exception. Safe when Sentry is not configured. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  try {
    if (context) {
      Sentry['withScope']((scope: SentryInstance) => {
        scope['setExtras'](context);
        Sentry['captureException'](err);
      });
    } else {
      Sentry['captureException'](err);
    }
  } catch {
    // Swallow — Sentry must never crash the app.
  }
}

/** Set the authenticated user on the Sentry scope. */
export function setSentryUser(id: string, email?: string): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry['setUser']({ id, email });
}

/** Clear the user (on logout). */
export function clearSentryUser(): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  Sentry['setUser'](null);
}
