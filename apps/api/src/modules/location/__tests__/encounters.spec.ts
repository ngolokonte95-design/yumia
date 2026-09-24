import { LocationService } from '../location.service';

/**
 * Règles de sécurité des Rencontres : une rencontre n'est enregistrée
 * qu'entre deux membres consentants, jamais malgré un blocage, et seulement
 * entre amis mutuels quand l'un partage sa position « aux amis » seulement.
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
      ['user:loc:other', JSON.stringify({ ...NEAR, visibility: opts.otherVisibility ?? 'everyone', updatedAt: '' })],
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
      await service.updateLocation('me', PARIS.lat, PARIS.lng, visibility as never);
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

  it('exige des amis mutuels quand la position est partagée aux amis seulement', async () => {
    const oneWay = setup({ otherVisibility: 'friends', mutual: false });
    await oneWay.run();
    expect(oneWay.upsert).not.toHaveBeenCalled();
    const mutual = setup({ otherVisibility: 'friends', mutual: true });
    await mutual.run();
    expect(mutual.upsert).toHaveBeenCalledTimes(1);
  });
});
