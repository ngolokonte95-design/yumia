import { DiscoverService } from '../discover.service';

/** « Qui peut me voir » dans les Rencontres : tout le monde, femmes ou hommes. */
describe('DiscoverService — audience des Rencontres', () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);

  function service(viewerGender: string | null, otherAudience: string) {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({ shareEncounters: true, gender: viewerGender })),
        findMany: jest.fn(async () => [
          { id: 'other', displayName: 'Léa', photoUrl: null, plan: 'free', bio: null, level: 3, encounterAudience: otherAudience },
        ]),
      },
      encounter: {
        findMany: jest.fn(async () => [{ id: 'e1', userAId: 'me', userBId: 'other', day: new Date('2026-09-24'), seenAt: old }]),
      },
      block: { findMany: jest.fn(async () => []) },
    };
    // Rencontres 18+ : le lecteur est majeur ici (assertAdult ne lève pas).
    const privacy = { assertAdult: jest.fn(async () => undefined), blockedIds: jest.fn(async () => []) };
    return new DiscoverService(prisma as never, {} as never, {} as never, privacy as never);
  }

  it('montre la rencontre quand l’autre accepte tout le monde', async () => {
    expect(await service('male', 'everyone').getMyEncounters('me')).toHaveLength(1);
  });

  it('la cache à un homme quand l’autre a choisi « femmes uniquement »', async () => {
    expect(await service('male', 'female').getMyEncounters('me')).toHaveLength(0);
    expect(await service('female', 'female').getMyEncounters('me')).toHaveLength(1);
  });

  it('la cache à qui n’a pas indiqué de genre, dès que l’autre restreint', async () => {
    expect(await service(null, 'female').getMyEncounters('me')).toHaveLength(0);
  });

  it("ne renvoie ni lieu, ni heure, ni l'audience de l'autre", async () => {
    const [e] = await service('male', 'everyone').getMyEncounters('me');
    expect(e).toEqual({ id: 'e1', day: '2026-09-24', otherUser: expect.not.objectContaining({ encounterAudience: expect.anything() }) });
  });
});
