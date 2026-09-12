import { MIN_SIGNUP_AGE, ageFromIso, toIsoBirthDate } from '../age-gate';

describe('toIsoBirthDate', () => {
  it('formate une date valide', () => {
    expect(toIsoBirthDate(7, 3, 1994)).toBe('1994-03-07');
  });

  it('refuse une date qui n existe pas', () => {
    // Piege : new Date(2000, 1, 31) reporte silencieusement au 2 mars.
    expect(toIsoBirthDate(31, 2, 2000)).toBeNull();
    expect(toIsoBirthDate(29, 2, 2001)).toBeNull();
    expect(toIsoBirthDate(29, 2, 2000)).toBe('2000-02-29'); // annee bissextile
  });

  it('refuse une saisie incomplete ou absurde', () => {
    expect(toIsoBirthDate(NaN, 3, 1994)).toBeNull();
    expect(toIsoBirthDate(7, 13, 1994)).toBeNull();
    expect(toIsoBirthDate(7, 3, 1800)).toBeNull();
    expect(toIsoBirthDate(7, 3, new Date().getFullYear() + 1)).toBeNull();
  });
});

describe('ageFromIso', () => {
  /** Date d anniversaire decalee de `deltaDays` par rapport a aujourd hui. */
  function birthdayShiftedBy(years: number, deltaDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + deltaDays);
    d.setFullYear(d.getFullYear() - years);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  it('compte les annees revolues, pas la difference des millesimes', () => {
    // Anniversaire passe hier : l age est atteint.
    expect(ageFromIso(birthdayShiftedBy(MIN_SIGNUP_AGE, -1))).toBe(MIN_SIGNUP_AGE);
    // Anniversaire demain : il manque un jour.
    expect(ageFromIso(birthdayShiftedBy(MIN_SIGNUP_AGE, 1))).toBe(MIN_SIGNUP_AGE - 1);
  });

  it('renvoie null sans date', () => {
    expect(ageFromIso(null)).toBeNull();
  });
});
