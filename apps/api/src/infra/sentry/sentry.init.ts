import { Logger } from '@nestjs/common';

const log = new Logger('Sentry');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SentryInstance = Record<string, any>;

let sentry: SentryInstance | null = null;

function getSentry(): SentryInstance | null {
  if (sentry !== null) return sentry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require('@sentry/node') as SentryInstance;
  } catch {
    sentry = null;
  }
  return sentry;
}

/**
 * Initializes Sentry for the NestJS API.
 *
 * Called once at startup in main.ts, before NestFactory.create(), so that
 * module-initialization errors are captured.
 *
 * No-op when SENTRY_DSN is not set (local / CI environments).
 * Requires `@sentry/node` to be installed:
 *   npm install @sentry/node --workspace=@yumia/api
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const Sentry = getSentry();
  if (!Sentry) {
    log.warn('@sentry/node non installé — crash reporting désactivé. Installez avec : npm install @sentry/node --workspace=@yumia/api');
    return;
  }

  Sentry['init']({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event: Record<string, unknown>) {
      const req = event['request'] as Record<string, unknown> | undefined;
      if (req?.['headers']) {
        const headers = req['headers'] as Record<string, unknown>;
        delete headers['authorization'];
        delete headers['cookie'];
      }
      return event;
    },
  });
  log.log('Sentry initialisé (DSN configuré)');
}

/**
 * Captures an exception in Sentry. Safe to call even when Sentry is not
 * initialized — the call is a no-op in that case.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const Sentry = getSentry();
  if (!Sentry) return;
  try {
    if (context) {
      Sentry['withScope']((scope: Record<string, unknown>) => {
        (scope['setExtras'] as (e: Record<string, unknown>) => void)(context);
        Sentry['captureException'](err);
      });
    } else {
      Sentry['captureException'](err);
    }
  } catch {
    // Swallow — Sentry must never crash the app.
  }
}
