import { GiftService } from '../gift.service';
import type { CatalogService } from '../catalog.service';

const makeCatalog = () => ({
  listProducts: jest.fn().mockResolvedValue({
    items: [], total: 0, page: 1, pageSize: 20, hasMore: false,
  }),
});

const makeService = (catalog: ReturnType<typeof makeCatalog>) =>
  new GiftService(catalog as unknown as CatalogService);

describe('GiftService.options', () => {
  it('met en tête l’occasion de la saison', () => {
    // Mi-septembre : la fête des grands-pères (4 octobre) est la plus proche,
    // même si l'ordre de déclaration du référentiel place Noël avant.
    const { occasions } = makeService(makeCatalog()).options(new Date('2026-09-20T12:00:00Z'));
    expect(occasions[0].slug).toBe('fete-des-grands-parents');
    expect(occasions[0].isNow).toBe(true);
    expect(occasions[0].daysUntil).toBe(14);
  });

  it('bascule sur Noël début décembre', () => {
    const { occasions } = makeService(makeCatalog()).options(new Date('2026-12-05T12:00:00Z'));
    expect(occasions[0].slug).toBe('noel');
  });

  it('classe les occasions en cours avant les autres', () => {
    const { occasions } = makeService(makeCatalog()).options(new Date('2026-11-20T12:00:00Z'));
    const firstDormant = occasions.findIndex((o) => !o.isNow);
    const lastActive = occasions.map((o) => o.isNow).lastIndexOf(true);
    expect(lastActive).toBeLessThan(firstDormant);
  });

  it('renvoie les occasions permanentes en dernier, sans date', () => {
    const { occasions } = makeService(makeCatalog()).options(new Date('2026-09-10T12:00:00Z'));
    const permanentes = occasions.filter((o) => o.date === null).map((o) => o.slug);
    expect(permanentes).toEqual(['anniversaire', 'anniversaire-mariage', 'juste-pour-offrir']);
    expect(occasions.slice(-3).map((o) => o.slug)).toEqual(permanentes);
  });

  it('expose les destinataires et budgets', () => {
    const { recipients, budgets } = makeService(makeCatalog()).options();
    expect(recipients.length).toBeGreaterThan(5);
    expect(budgets.some((b) => b.slug === 'peu-importe')).toBe(true);
  });
});

describe('GiftService.suggest', () => {
  it('traduit les réponses en filtre catalogue', async () => {
    const catalog = makeCatalog();
    await makeService(catalog).suggest({ recipient: 'enfant', occasion: 'noel', budget: 'moyen' });

    const [query, isAdmin] = catalog.listProducts.mock.calls[0];
    expect(query.categorySlugs).toContain('jouets-cadeaux');
    expect(query.minPriceCents).toBe(2000);
    expect(query.maxPriceCents).toBe(5000);
    expect(isAdmin).toBe(false);
  });

  it('n’impose aucun plafond sur « peu importe »', async () => {
    const catalog = makeCatalog();
    await makeService(catalog).suggest({ budget: 'peu-importe' });

    const [query] = catalog.listProducts.mock.calls[0];
    // `undefined` et non 0 : un plafond à zéro ne renverrait jamais rien.
    expect(query.minPriceCents).toBeUndefined();
    expect(query.maxPriceCents).toBeUndefined();
  });

  it('fonctionne sans aucun critère', async () => {
    const catalog = makeCatalog();
    const res = await makeService(catalog).suggest({});

    const [query] = catalog.listProducts.mock.calls[0];
    expect(query.categorySlugs).toBeUndefined();
    expect(res.criteria).toEqual({
      recipient: null, occasion: null, budget: null, categorySlugs: [],
    });
  });

  it('ignore un slug inconnu au lieu d’échouer', async () => {
    // Une application plus ancienne peut envoyer une occasion retirée depuis.
    const catalog = makeCatalog();
    const res = await makeService(catalog).suggest({ occasion: 'fete-du-slip', recipient: 'femme' });

    expect(res.criteria.occasion).toBeNull();
    expect(res.criteria.recipient?.slug).toBe('femme');
  });

  it('transmet le statut admin pour la marge', async () => {
    const catalog = makeCatalog();
    await makeService(catalog).suggest({ recipient: 'homme' }, true);
    expect(catalog.listProducts.mock.calls[0][1]).toBe(true);
  });
});
