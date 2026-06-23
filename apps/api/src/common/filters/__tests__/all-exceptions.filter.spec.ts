import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from '../all-exceptions.filter';

// ── Mock Sentry capture ───────────────────────────────────────────────────────

const captureException = jest.fn();
jest.mock('../../../infra/sentry/sentry.init', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHost(
  reqOverrides: Partial<{ method: string; url: string; headers: Record<string, unknown> }> = {},
): { host: ArgumentsHost; res: { status: jest.Mock; json: jest.Mock }; statusCode: () => number; body: () => Record<string, unknown> } {
  let capturedStatus = 0;
  let capturedBody: Record<string, unknown> = {};

  const json = jest.fn((body: Record<string, unknown>) => {
    capturedBody = body;
  });
  const status = jest.fn((code: number) => {
    capturedStatus = code;
    return { json };
  });

  const req = {
    method: reqOverrides.method ?? 'GET',
    url: reqOverrides.url ?? '/api/test',
    headers: reqOverrides.headers ?? { 'x-request-id': 'req-123' },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    res: { status, json },
    statusCode: () => capturedStatus,
    body: () => capturedBody,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.clearAllMocks();
    // Silence le logger d'erreur pour ne pas polluer la sortie de test
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('renvoie le statut HTTP d\'une HttpException', () => {
    const ctx = makeHost();
    filter.catch(new NotFoundException('Introuvable'), ctx.host);

    expect(ctx.statusCode()).toBe(HttpStatus.NOT_FOUND);
  });

  it('renvoie 500 pour une erreur non-HTTP', () => {
    const ctx = makeHost();
    filter.catch(new Error('boom'), ctx.host);

    expect(ctx.statusCode()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('inclut path, timestamp et requestId dans la réponse', () => {
    const ctx = makeHost({ url: '/api/places', headers: { 'x-request-id': 'abc-789' } });
    filter.catch(new BadRequestException('Mauvaise requête'), ctx.host);

    const body = ctx.body();
    expect(body.path).toBe('/api/places');
    expect(body.requestId).toBe('abc-789');
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(typeof body.timestamp).toBe('string');
  });

  it('propage le corps structuré d\'une HttpException dans error', () => {
    const ctx = makeHost();
    const exc = new BadRequestException({ message: ['email invalide'], error: 'Bad Request' });
    filter.catch(exc, ctx.host);

    expect(ctx.body().error).toMatchObject({ message: ['email invalide'] });
  });

  it('capture l\'exception dans Sentry pour les erreurs 5xx', () => {
    const ctx = makeHost({ method: 'POST', url: '/api/crash' });
    filter.catch(new Error('database down'), ctx.host);

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ method: 'POST', url: '/api/crash' }),
    );
  });

  it('ne capture PAS dans Sentry pour les erreurs 4xx', () => {
    const ctx = makeHost();
    filter.catch(new BadRequestException('client error'), ctx.host);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('tolère l\'absence de x-request-id', () => {
    const ctx = makeHost({ headers: {} });
    filter.catch(new NotFoundException(), ctx.host);

    expect(ctx.body().requestId).toBeUndefined();
    expect(ctx.statusCode()).toBe(HttpStatus.NOT_FOUND);
  });

  it('renvoie "Internal server error" comme message pour une erreur non-HTTP', () => {
    const ctx = makeHost();
    filter.catch('une string brute', ctx.host);

    expect(ctx.body().error).toBe('Internal server error');
    expect(ctx.statusCode()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('respecte un statut HttpException personnalisé (418)', () => {
    const ctx = makeHost();
    filter.catch(new HttpException('teapot', 418), ctx.host);

    expect(ctx.statusCode()).toBe(418);
  });
});
