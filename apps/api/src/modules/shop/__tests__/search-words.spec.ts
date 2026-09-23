import { searchWords } from '../search-words';

describe('searchWords', () => {
  it('découpe la recherche en mots indépendants', () => {
    expect(searchWords('Robe rouge')).toEqual(['robe', 'rouge']);
  });

  it('ramène le pluriel au singulier pour retrouver les deux', () => {
    expect(searchWords('robes jeux')).toEqual(['robe', 'jeu']);
  });

  it('ignore les mots de liaison et les lettres isolées', () => {
    expect(searchWords("sac à dos pour l'école")).toEqual(['sac', 'dos', 'école']);
  });

  it('renvoie une liste vide pour une recherche vide', () => {
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('plafonne à cinq mots et retire les doublons', () => {
    expect(searchWords('a1 b2 c3 d4 e5 f6 a1')).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
  });
});
