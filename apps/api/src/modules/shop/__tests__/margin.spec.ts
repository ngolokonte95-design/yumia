import { effectiveMargin, sellingPriceCents } from '../aliexpress.service';
import { adminMargin } from '../catalog.service';

describe('sellingPriceCents', () => {
  it('applique ×3 sur la première tranche', () => {
    expect(sellingPriceCents(148)).toBe(444); // 1,48 € -> 4,44 €
    expect(sellingPriceCents(519)).toBe(1557); // 5,19 € -> 15,57 €
    expect(sellingPriceCents(1000)).toBe(3000); // pile la frontière
  });

  it('applique ×2,5 puis ×2 sur les tranches suivantes', () => {
    // 10 € × 3 + 8,39 € × 2,5
    expect(sellingPriceCents(1839)).toBe(3000 + Math.round(839 * 2.5));
    // 10 € × 3 + 20 € × 2,5 + 20 € × 2
    expect(sellingPriceCents(5000)).toBe(3000 + 5000 + 4000);
  });

  it('reste monotone à la frontière des tranches', () => {
    // Le piège d'un barème par palier : un article acheté 10,00 € serait
    // vendu 25,00 € quand un article acheté 9,99 € partirait à 29,97 €.
    expect(sellingPriceCents(1000)).toBeGreaterThan(sellingPriceCents(999));
    expect(sellingPriceCents(3000)).toBeGreaterThan(sellingPriceCents(2999));
  });

  it('ne baisse jamais quand le prix d’achat monte', () => {
    let previous = -1;
    for (let cost = 0; cost <= 20000; cost += 37) {
      const price = sellingPriceCents(cost);
      expect(price).toBeGreaterThanOrEqual(previous);
      previous = price;
    }
  });

  it('vend toujours au-dessus du prix d’achat', () => {
    for (const cost of [1, 99, 1000, 4999, 25000]) {
      expect(sellingPriceCents(cost)).toBeGreaterThan(cost);
    }
  });

  it('renvoie des centiers entiers, jamais de flottants', () => {
    for (const cost of [1, 7, 333, 1001, 2999, 18397]) {
      expect(Number.isInteger(sellingPriceCents(cost))).toBe(true);
    }
  });

  it('gère un prix nul sans exploser', () => {
    expect(sellingPriceCents(0)).toBe(0);
    expect(effectiveMargin(0)).toBe(0);
  });
});

describe('effectiveMargin', () => {
  it('décroît de 3 vers 2 à mesure que le prix monte', () => {
    expect(effectiveMargin(500)).toBeCloseTo(3, 2);
    expect(effectiveMargin(2000)).toBeLessThan(3);
    expect(effectiveMargin(2000)).toBeGreaterThan(2.5);
    expect(effectiveMargin(100000)).toBeLessThan(2.1);
    expect(effectiveMargin(100000)).toBeGreaterThan(2);
  });
});

describe('adminMargin', () => {
  it('donne la marge en euros et en pourcentage du prix de vente', () => {
    const m = adminMargin(1557, 519);
    expect(m).not.toBeNull();
    expect(m!.marginCents).toBe(1038);
    expect(m!.marginPercent).toBeCloseTo(66.7, 1);
    expect(m!.multiplier).toBe(3);
  });

  it('renvoie null quand le prix d’achat est inconnu', () => {
    // Un produit saisi à la main n'a pas de prix AliExpress : mieux vaut ne
    // rien afficher qu'une marge de 100 % qui laisserait croire à un article
    // gratuit à l'achat.
    expect(adminMargin(1200, null)).toBeNull();
    expect(adminMargin(1200, 0)).toBeNull();
  });
});
