import { SHOP_CATEGORIES, titleSignature, tooSimilar } from '../shop-categories';

/**
 * Les titres ci-dessous sont ceux réellement renvoyés par AliExpress lors du
 * premier import du rayon voyage — celui qui a produit cinq organisateurs de
 * valise et quatre cadenas TSA d'affilée. Les figer ici évite de régler le
 * seuil de similarité sur des exemples inventés, plus propres que la réalité.
 */
const ORGANISATEURS = [
  "Organisateur de valise grande capacité, organisateur de bagages de voyage, étagères suspendues",
  "Organisateur de valise, organisateur de bagages de voyage, étagères suspendues pliables",
  "Organisateur de valise, organisateur de bagages de voyage de grande capacité, portable",
];

const CADENAS = [
  "TSA-Serrure à Bagages Personnalisée pour Sac de Voyage, Outil de Sécurité",
  "Serrures à bagages approuvées par TSA, cadenas à câble de voyage combiné",
  "Serrures de bagages approuvées par la TSA, serrures TSA pour bagages, cadenas",
];

const DISTINCTS = [
  "Oreiller de voyage gonflable pour le cou, idéal pour dormir sur le côté en avion",
  "Adaptateur de prise britannique universel US EU AU vers UK",
  "Trousse de Toilette de Voyage Grande, Organisateur Suspendu Étanche",
];

describe('tooSimilar', () => {
  it('rapproche les annonces multiples du même article', () => {
    for (const groupe of [ORGANISATEURS, CADENAS]) {
      const [reference, ...jumeaux] = groupe.map(titleSignature);
      for (const jumeau of jumeaux) {
        expect(tooSimilar(reference, jumeau)).toBe(true);
      }
    }
  });

  it('laisse passer des produits réellement différents', () => {
    const signatures = DISTINCTS.map(titleSignature);
    for (let i = 0; i < signatures.length; i++) {
      for (let j = i + 1; j < signatures.length; j++) {
        expect(tooSimilar(signatures[i], signatures[j])).toBe(false);
      }
    }
  });

  it("ne rapproche pas deux titres sur le seul vocabulaire marketing", () => {
    // Sans filtrage des mots vides, ces deux titres partageraient l'essentiel
    // de leurs mots alors qu'ils désignent des produits sans rapport.
    const a = titleSignature('Sac grande capacité portable multifonctionnel pour femmes');
    const b = titleSignature('Lampe grande capacité portable multifonctionnelle pour femmes');
    expect(tooSimilar(a, b)).toBe(false);
  });

  it('ignore les signatures vides plutôt que de diviser par zéro', () => {
    expect(tooSimilar(titleSignature('les des une'), titleSignature('pour avec'))).toBe(false);
  });
});

describe('SHOP_CATEGORIES', () => {
  it('offre assez de termes de recherche pour éviter les grappes', () => {
    // Cinq termes concentraient l'import sur les cinq meilleurs résultats de
    // chacun, donc cinq familles de produits quasi identiques par rayon.
    for (const c of SHOP_CATEGORIES) {
      expect(c.searchTerms.length).toBeGreaterThanOrEqual(10);
      expect(new Set(c.searchTerms).size).toBe(c.searchTerms.length);
    }
  });

  it('a des slugs uniques', () => {
    const slugs = SHOP_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
