import { hydrationRadius, hydrationTile } from '../places.service';

describe('hydrationTile', () => {
  it('ramène les rayons voisins à une même zone, quel que soit le zoom', () => {
    const keys = [2_000, 2_500, 3_000].map((r) => JSON.stringify(hydrationTile(48.8566, 2.3522, r)));
    expect(new Set(keys).size).toBe(1);
  });

  it('prend la taille fixe immédiatement supérieure au rayon demandé', () => {
    expect(hydrationTile(0, 0, 800).radiusKm).toBe(1);
    expect(hydrationTile(0, 0, 5_000).radiusKm).toBe(10);
    expect(hydrationTile(0, 0, 20_000).radiusKm).toBe(20);
    expect(hydrationTile(0, 0, 90_000).radiusKm).toBe(50);
  });

  it("ne compte pas un léger déplacement comme une nouvelle zone", () => {
    const a = hydrationTile(48.851, 2.351, 8_000);
    const b = hydrationTile(48.859, 2.358, 8_000);
    expect(a).toEqual(b);
  });
});

describe('hydrationRadius', () => {
  it('charge les épiceries sur une petite zone autour de l\'utilisateur, pas sur 20 km', () => {
    expect(hydrationRadius(20_000, 'grocery_store')).toBe(3_000);
    expect(hydrationTile(49.0364, 2.0763, hydrationRadius(20_000, 'grocery_store')).radiusKm).toBe(3);
  });

  it('ne change rien pour les autres univers ni pour un rayon déjà petit', () => {
    expect(hydrationRadius(20_000, 'restaurant')).toBe(20_000);
    expect(hydrationRadius(20_000)).toBe(20_000);
    expect(hydrationRadius(1_000, 'grocery_store')).toBe(1_000);
  });
});
