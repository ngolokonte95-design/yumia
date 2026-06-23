import {
  request,
  ApiError,
  registerTokenRefresher,
  unregisterTokenRefresher,
} from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOnce(res: { ok?: boolean; status: number; body?: unknown; nonJson?: boolean }) {
  return {
    ok: res.ok ?? (res.status >= 200 && res.status < 300),
    status: res.status,
    json: res.nonJson
      ? jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      : jest.fn().mockResolvedValue(res.body ?? {}),
  } as unknown as Response;
}

const okJson = (body: unknown) => mockFetchOnce({ status: 200, body });

describe('api.request', () => {
  beforeEach(() => {
    jest.useRealTimers();
    unregisterTokenRefresher();
    global.fetch = jest.fn();
  });

  afterEach(() => jest.clearAllMocks());

  // ── Happy path ──────────────────────────────────────────────────────────

  it('retourne le JSON parsé sur 200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ id: 'x' }));

    const result = await request<{ id: string }>('/places');

    expect(result).toEqual({ id: 'x' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/places'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('envoie Content-Type + body sérialisé sur POST', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ ok: true }));

    await request('/x', { method: 'POST', body: { a: 1 } });

    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('ajoute le header Authorization quand un token est fourni', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({}));

    await request('/me', { token: 'tok-123' });

    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('retourne undefined sur 204 No Content', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchOnce({ status: 204 }));

    const result = await request('/auth/me/logout', { method: 'POST' });

    expect(result).toBeUndefined();
  });

  // ── Erreurs ──────────────────────────────────────────────────────────────

  it('lève une ApiError avec le status sur 4xx, sans retry', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchOnce({ status: 400, body: { error: { message: 'Champ invalide' } } }),
    );

    await expect(request('/x')).rejects.toMatchObject({ status: 400, message: 'Champ invalide' });
    expect(global.fetch).toHaveBeenCalledTimes(1); // pas de retry sur 4xx
  });

  it('extrait un message d\'erreur de type string', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchOnce({ status: 403, body: { error: 'Accès refusé' } }),
    );

    await expect(request('/x')).rejects.toMatchObject({ message: 'Accès refusé' });
  });

  it('retombe sur un message générique si le corps n\'est pas JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchOnce({ status: 500, nonJson: true }));
    jest.useFakeTimers();

    const p = request('/x').catch((e) => e as ApiError);
    await jest.runAllTimersAsync();
    const err = (await p) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('500');
  });

  // ── Retry ────────────────────────────────────────────────────────────────

  it('réessaie sur 5xx puis lève après MAX_RETRIES (3 appels au total)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchOnce({ status: 503, body: {} }));
    jest.useFakeTimers();

    const p = request('/x').catch((e) => e as ApiError);
    await jest.runAllTimersAsync();
    const err = await p;

    expect(err).toBeInstanceOf(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(3); // attempt 0 + 2 retries
  });

  it('réussit au 2e essai après un 500 transitoire', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchOnce({ status: 500, body: {} }))
      .mockResolvedValueOnce(okJson({ recovered: true }));
    jest.useFakeTimers();

    const p = request<{ recovered: boolean }>('/x');
    await jest.runAllTimersAsync();
    const result = await p;

    expect(result).toEqual({ recovered: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('mappe un AbortError (timeout) sur ApiError status 0', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortErr);
    jest.useFakeTimers();

    const p = request('/x').catch((e) => e as ApiError);
    await jest.runAllTimersAsync();
    const err = (await p) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(3); // status 0 est retryable
  });

  // ── Refresh silencieux 401 ────────────────────────────────────────────────

  it('rafraîchit le token sur 401 puis rejoue la requête avec le nouveau token', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockFetchOnce({ status: 401, body: {} }))
      .mockResolvedValueOnce(okJson({ ok: true }));
    const refresher = jest.fn().mockResolvedValue('fresh-token');
    registerTokenRefresher(refresher);

    const result = await request<{ ok: boolean }>('/me', { token: 'stale' });

    expect(result).toEqual({ ok: true });
    expect(refresher).toHaveBeenCalledTimes(1);
    // 2e appel rejoué avec le token frais
    const secondInit = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(secondInit.headers.Authorization).toBe('Bearer fresh-token');
  });

  it('lève 401 si aucun refresher n\'est enregistré', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchOnce({ status: 401, body: {} }));

    await expect(request('/me', { token: 'stale' })).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
