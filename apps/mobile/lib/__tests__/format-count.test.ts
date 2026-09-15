import { formatCount } from '../format-count';

describe('formatCount', () => {
  it('laisse les petits nombres tels quels', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999)).toBe('999');
  });

  it('abrege a partir du millier, avec une decimale utile', () => {
    expect(formatCount(1000)).toBe('1 k');
    expect(formatCount(1240)).toBe('1,2 k');
    expect(formatCount(9990)).toBe('10 k');
  });

  it('arrondit au millier au-dela de dix mille', () => {
    expect(formatCount(12_400)).toBe('12 k');
    expect(formatCount(999_000)).toBe('999 k');
  });

  it('passe au million', () => {
    expect(formatCount(1_243_891)).toBe('1,2 M');
    expect(formatCount(2_000_000)).toBe('2 M');
  });

  it('traite l absence de valeur comme zero', () => {
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
  });
});
