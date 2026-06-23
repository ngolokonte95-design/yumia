import { nextSearchHistory } from '../useSearchHistory';

describe('nextSearchHistory', () => {
  it('ajoute une requête en tête de l\'historique', () => {
    expect(nextSearchHistory(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('trim la requête avant insertion', () => {
    expect(nextSearchHistory([], '  pizza  ')).toEqual(['pizza']);
  });

  it('renvoie prev inchangé si la requête est vide après trim', () => {
    const prev = ['a', 'b'];
    expect(nextSearchHistory(prev, '   ')).toBe(prev);
  });

  it('dédoublonne en remontant l\'occurrence existante en tête', () => {
    expect(nextSearchHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('dédoublonne de façon insensible à la casse', () => {
    expect(nextSearchHistory(['Sushi', 'Pizza'], 'sushi')).toEqual(['sushi', 'Pizza']);
  });

  it('plafonne l\'historique à la limite max', () => {
    const prev = Array.from({ length: 10 }, (_, i) => `q${i}`);
    const next = nextSearchHistory(prev, 'nouvelle');

    expect(next).toHaveLength(10);
    expect(next[0]).toBe('nouvelle');
    expect(next).not.toContain('q9'); // la plus ancienne est évincée
  });

  it('respecte une limite max personnalisée', () => {
    expect(nextSearchHistory(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
  });

  it('ne mute pas le tableau d\'entrée', () => {
    const prev = ['a', 'b'];
    nextSearchHistory(prev, 'c');
    expect(prev).toEqual(['a', 'b']);
  });
});
