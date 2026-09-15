import { isGenericName } from '../itinerary.service';

describe('isGenericName', () => {
  it('reconnaît un genre de lieu, qu’un vrai lieu peut remplacer', () => {
    // Trame de repli et formulations courantes de l'IA.
    expect(isGenericName('Un bar à cocktails')).toBe(true);
    expect(isGenericName('Une spécialité locale')).toBe(true);
    expect(isGenericName('Le musée principal')).toBe(true);
    expect(isGenericName("L'apéro du soir")).toBe(true);
    expect(isGenericName('Des souvenirs à rapporter')).toBe(true);
  });

  it('protège un nom propre — rien ne doit lui être substitué', () => {
    expect(isGenericName('Real Alcázar')).toBe(false);
    expect(isGenericName('Cascade El Limón')).toBe(false);
    expect(isGenericName('El Cabito')).toBe(false);
    expect(isGenericName('Museo Arqueológico MARQ')).toBe(false);
    expect(isGenericName('Marché Central de Valence')).toBe(false);
    // Un article en tête ne suffit pas : ces deux-là sont des enseignes.
    expect(isGenericName("L'Atelier de Joël")).toBe(false);
    expect(isGenericName('La Boqueria')).toBe(false);
  });

  it('ne se laisse pas avoir par une chaîne vide', () => {
    expect(isGenericName('')).toBe(false);
    expect(isGenericName('   ')).toBe(false);
  });

  describe('intitule de genre sans article', () => {
    it('reconnait un genre suivi de mots en minuscules', () => {
      expect(isGenericName('Bouchon lyonnais – Quartier Saint-Jean')).toBe(true);
      expect(isGenericName('Bar a cocktails')).toBe(true);
      expect(isGenericName('Restaurant italien du centre')).toBe(true);
    });

    it('respecte les majuscules, qui introduisent un nom propre', () => {
      expect(isGenericName('Restaurant El Cabito')).toBe(false);
      expect(isGenericName('Musee des Civilisations de l Europe')).toBe(false);
      expect(isGenericName('Glacier Terre de Glace')).toBe(false);
      expect(isGenericName('Bar du Caveau de la Huchette')).toBe(false);
    });
  });
});
