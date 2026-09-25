import { request, registerTokenRefresher, unregisterTokenRefresher } from '../api';

function res(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('refresh partagé sur 401 simultanés', () => {
  beforeEach(() => {
    unregisterTokenRefresher();
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return Promise.resolve(auth === 'Bearer fresh' ? res(200, { ok: true }) : res(401));
    }) as unknown as typeof fetch;
  });

  it('un seul refresh pour trois requêtes en 401', async () => {
    let resolveRefresh: (t: string) => void = () => {};
    const refresher = jest.fn(() => new Promise<string | null>((r) => { resolveRefresh = r; }));
    registerTokenRefresher(refresher);

    const all = Promise.all([
      request('/a', { token: 'stale' }),
      request('/b', { token: 'stale' }),
      request('/c', { token: 'stale' }),
    ]);
    // Laisse les trois 401 arriver avant de terminer le refresh.
    await new Promise((r) => setTimeout(r, 0));
    resolveRefresh('fresh');

    await expect(all).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('relance un nouveau refresh une fois le précédent terminé', async () => {
    const refresher = jest.fn().mockResolvedValue('fresh');
    registerTokenRefresher(refresher);
    await request('/a', { token: 'stale' });
    await request('/b', { token: 'stale' });
    expect(refresher).toHaveBeenCalledTimes(2);
  });
});
