import { LocationService } from '../location.service';

/**
 * Règles de sécurité des Rencontres : une rencontre n'est enregistrée
 * qu'entre deux membres consentants, jamais malgré un blocage — et sans
 * exiger d'abonnement : le but est de rencontrer de nouvelles personnes.
 */
describe('LocationService — rencontres', () => {
  const PARIS = { lat: 48.8566, lng: 2.3522 };
  // ~30 m plus loin : « croisé ».
  const NEAR = { lat: 48.8568, lng: 2.3524 };

  function setup(opts: {
    meOptedIn?: boolean;
    otherOptedIn?: boolean;
    otherVisibility?: string;
    blocked?: boolean;
    mutual?: boolean;
  }) {
    const store = new Map<string, string>([
      ['user:enc:other', JSON.stringify({ ...NEAR, updatedAt: '' })],
    ]);
    const redis = {
      raw: {
        setex: jest.fn(async (k: string, _t: number, v: string) => { store.set(k, v); }),
        del: jest.fn(),
        keys: jest.fn(async () => [...store.keys()]),
        get: jest.fn(async (k: string) => store.get(k) ?? null),
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ shareEncounters: opts.meOptedIn ?? true })),
        findMany: jest.fn(async () => ((opts.otherOptedIn ?? true) ? [{ id: 'other' }] : [])),
      },
      block: { findMany: jest.fn(async () => (opts.blocked ? [{ blockerId: 'other', blockedId: 'me' }] : [])) },
      follow: {
        findMany: jest.fn(async () =>
          opts.mutual
            ? [{ followerId: 'me', followingId: 'other' }, { followerId: 'other', followingId: 'me' }]
            : [{ followerId: 'me', followingId: 'other' }],
        ),
      },
      encounter: { upsert: jest.fn(async () => ({})) },
    };
    const service = new LocationService(redis as never, prisma as never);
    const run = async (visibility = 'everyone') => {
      void visibility;
      await service.updateEncounterLocation('me', PARIS.lat, PARIS.lng);
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    };
    return { run, upsert: prisma.encounter.upsert };
  }

  it('enregistre une rencontre entre deux membres consentants, sans lieu', async () => {
    const { run, upsert } = setup({});
    await run();
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = (upsert.mock.calls[0] as unknown as [{ create: Record<string, unknown> }])[0];
    expect(arg.create).not.toHaveProperty('placeId');
    expect(arg.create).toHaveProperty('day');
  });

  it("n'enregistre rien si l'un des deux n'a pas activé les Rencontres", async () => {
    const a = setup({ meOptedIn: false });
    await a.run();
    expect(a.upsert).not.toHaveBeenCalled();
    const b = setup({ otherOptedIn: false });
    await b.run();
    expect(b.upsert).not.toHaveBeenCalled();
  });

  it('respecte un blocage', async () => {
    const { run, upsert } = setup({ blocked: true });
    await run();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fonctionne entre inconnus : aucun abonnement n'est exigé", async () => {
    // Le but des Rencontres est d'en faire de nouvelles, y compris quand la
    // position n'est partagée qu'« aux amis » pour la carte.
    const { run, upsert } = setup({ otherVisibility: 'friends', mutual: false });
    await run('friends');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("n'enregistre aucune rencontre depuis le partage sur la carte", async () => {
    // Carte et Rencontres sont séparées : partager sa position sur la carte
    // n'expose pas aux Rencontres, et inversement.
    const { upsert } = setup({});
    const redis = { raw: { setex: jest.fn(), del: jest.fn(), keys: jest.fn(async () => []), get: jest.fn() } };
    const prisma = { user: { findUnique: jest.fn(async () => ({ mapAudience: 'friends' })) } };
    const service = new LocationService(redis as never, prisma as never);
    const res = await service.updateLocation('me', PARIS.lat, PARIS.lng, 'everyone' as never);
    // L'audience vient du réglage, pas de ce que demande l'app.
    expect(res).toEqual({ status: 'ok', visibility: 'friends' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
