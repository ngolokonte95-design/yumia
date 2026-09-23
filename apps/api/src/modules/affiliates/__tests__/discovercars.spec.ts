import { carRentalPathCandidates, slugify } from '../providers/discovercars.provider';

describe('Discover Cars — adresses des pages ville', () => {
  it('reproduit les adresses du générateur de l’espace affilié', () => {
    expect(carRentalPathCandidates('France', 'Paris', ['Ile-de-France'])).toEqual(['france/paris']);
    expect(carRentalPathCandidates('United Kingdom', 'London', ['England'])).toEqual(['united-kingdom/london']);
  });

  it("accole l'État au pays pour les États-Unis, avec la ville en dernier recours", () => {
    expect(carRentalPathCandidates('United States', 'Washington', ['District of Columbia'])).toEqual([
      'usa-district-of-columbia/washington',
      'usa-washington/washington',
    ]);
  });

  it('retire accents et ponctuation', () => {
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify("Côte d'Azur")).toBe('cote-d-azur');
  });
});
