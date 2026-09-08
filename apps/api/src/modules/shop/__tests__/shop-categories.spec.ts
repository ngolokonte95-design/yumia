import {
  SHOP_CATEGORIES,
  isBanned,
  isJunk,
  isRelevant,
  titleSignature,
  tooSimilar,
} from '../shop-categories';

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
    // Un rayon parent est exempté : il n'importe rien lui-même, ses produits
    // viennent de ses sous-rayons.
    const parents = new Set(SHOP_CATEGORIES.map((c) => c.parentSlug).filter(Boolean));
    for (const c of SHOP_CATEGORIES) {
      if (parents.has(c.slug)) {
        expect(c.searchTerms).toEqual([]);
        continue;
      }
      expect(c.searchTerms.length).toBeGreaterThanOrEqual(10);
      expect(new Set(c.searchTerms).size).toBe(c.searchTerms.length);
    }
  });

  it('rattache chaque sous-rayon à un parent qui existe', () => {
    const slugs = new Set(SHOP_CATEGORIES.map((c) => c.slug));
    for (const c of SHOP_CATEGORIES) {
      if (c.parentSlug) expect(slugs.has(c.parentSlug)).toBe(true);
    }
  });

  it("n'imbrique pas les sous-rayons sur plus d'un niveau", () => {
    // L'accueil masque les enfants et le rayon parent agrège les siens : un
    // petit-enfant ne serait affiché nulle part.
    const parentOf = new Map(SHOP_CATEGORIES.map((c) => [c.slug, c.parentSlug]));
    for (const c of SHOP_CATEGORIES) {
      if (c.parentSlug) expect(parentOf.get(c.parentSlug)).toBeUndefined();
    }
  });

  it('a des slugs uniques', () => {
    const slugs = SHOP_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('filtres de mots-clés', () => {
  it('ne bloque pas un mot qui en contient un autre', () => {
    // Constaté en production : « arme » (interdit) bloquait « alarme », donc
    // tous les antivols de vélo et alarmes de voiture disparaissaient du
    // catalogue — 17 produits perdus en silence sur deux rayons.
    for (const titre of [
      'Alarme antivol pour velo avec telecommande',
      "Systeme d'alarme de voiture universel 12V",
      'Casque moto style gendarmerie',
      'Serviette de plage pour les thermes',
    ]) {
      expect(isBanned(titre)).toBe(false);
    }
  });

  it('bloque toujours les vrais interdits', () => {
    for (const titre of [
      'Sac a main Louis Vuitton cuir veritable',
      'Machine a tatouer rotative professionnelle',
      'Arme de defense personnelle compacte',
      'Lentille de contact coloree annuelle',
    ]) {
      expect(isBanned(titre)).toBe(true);
    }
  });

  it('accepte les pluriels sans les lister un par un', () => {
    expect(isRelevant('Lot de 3 gourdes isothermes', ['gourde'])).toBe(true);
    expect(isRelevant('Outils de precision pour atelier', ['outil'])).toBe(true);
  });

  it("n'accepte pas un mot-clé noyé dans un autre mot", () => {
    // « cle » (rayon bricolage) rendait pertinents « boucle » et « spectacle ».
    expect(isRelevant("Boucle d'oreille fantaisie", ['cle'])).toBe(false);
    expect(isRelevant('Cle a molette reglable 250mm', ['cle'])).toBe(true);
  });

  it('couvre chaque terme de recherche par au moins un mot-clé du rayon', () => {
    // Sans ça, un rayon cherche « scie sauteuse » puis rejette tous les
    // résultats parce que « scie » n'est pas dans sa liste de pertinence —
    // c'est ce qui vidait les rayons bricolage et pique-nique.
    const orphelins: string[] = [];
    for (const c of SHOP_CATEGORIES) {
      for (const term of c.searchTerms) {
        if (!isRelevant(term, c.keywords)) orphelins.push(`${c.slug} : ${term}`);
      }
    }
    expect(orphelins).toEqual([]);
  });
});

describe('camelote relative au rayon', () => {
  const bijoux = SHOP_CATEGORIES.find((c) => c.slug === 'bijoux-montres')!;

  it('ne jette pas ce que le rayon vend précisément', () => {
    // « pendentif » et « boucle d'oreille » sont dans la liste camelote parce
    // qu'ils polluent les autres rayons. Les appliquer au rayon bijoux le
    // viderait de ses articles les plus vendus.
    for (const titre of [
      'Pendentif argent 925 avec chaine fine',
      "Boucle d'oreille creole acier inoxydable",
    ]) {
      expect(isJunk(titre, bijoux.keywords)).toBe(false);
      expect(isJunk(titre)).toBe(true);
    }
  });

  it('continue de jeter la camelote qui n’a rien à faire là', () => {
    expect(isJunk('Autocollant decoratif mural', bijoux.keywords)).toBe(true);
    expect(isJunk('Porte-cles fantaisie voiture', bijoux.keywords)).toBe(true);
  });
});
