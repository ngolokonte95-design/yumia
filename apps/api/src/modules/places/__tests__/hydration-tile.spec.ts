import { hydrationTile } from '../places.service';

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
