import { PrivacyService, isAdult, adultBirthYearFilter } from '../privacy.service';

describe('isAdult (Tind et Rencontres 18+)', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('est majeur de façon certaine à partir de 19 ans civils', () => {
    expect(isAdult(2007, now)).toBe(true); // au moins 18 ans révolus en 2026
    expect(isAdult(2008, now)).toBe(false); // 17 ou 18 ans : pas certain
    expect(isAdult(2010, now)).toBe(false);
  });

  it("n'accepte pas un compte sans année de naissance", () => {
    expect(isAdult(null, now)).toBe(false);
    expect(isAdult(undefined, now)).toBe(false);
  });

  it('le filtre Prisma suit la même borne', () => {
    expect(adultBirthYearFilter(now)).toEqual({ birthYear: { not: null, lte: 2007 } });
  });
});

describe('PrivacyService.canViewContent', () => {
  function service(opts: { isPrivate?: boolean; blocked?: boolean; follows?: boolean; exists?: boolean }) {
    const prisma = {
      user: { findUnique: jest.fn(async () => (opts.exists === false ? null : { isPrivate: !!opts.isPrivate })) },
      block: { count: jest.fn(async () => (opts.blocked ? 1 : 0)) },
      follow: { count: jest.fn(async () => (opts.follows ? 1 : 0)) },
    };
    return new PrivacyService(prisma as never);
  }

  it('voit toujours son propre contenu', async () => {
    expect(await service({ isPrivate: true, blocked: true }).canViewContent('me', 'me')).toBe(true);
  });

  it('voit un compte public', async () => {
    expect(await service({}).canViewContent('me', 'other')).toBe(true);
  });

  it('ne voit rien en cas de blocage, dans un sens ou dans l’autre', async () => {
    expect(await service({ blocked: true }).canViewContent('me', 'other')).toBe(false);
  });

  it('compte privé : seulement ses abonnés', async () => {
    expect(await service({ isPrivate: true }).canViewContent('me', 'other')).toBe(false);
    expect(await service({ isPrivate: true, follows: true }).canViewContent('me', 'other')).toBe(true);
  });

  it('compte inexistant : rien', async () => {
    expect(await service({ exists: false }).canViewContent('me', 'other')).toBe(false);
  });
});
