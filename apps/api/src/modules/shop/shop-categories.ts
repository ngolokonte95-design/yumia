/**
 * Rayons de la boutique YUMIA.
 *
 * Chaque rayon est rattaché quand c'est pertinent à un univers YUMIA
 * (`universe`) : c'est ce qui permet de proposer des produits en contexte —
 * l'utilisateur qui consulte des randonnées voit le rayon Randonnée.
 *
 * `searchTerms` alimente l'import AliExpress, `keywords` sert de filtre de
 * pertinence : les vendeurs AliExpress bourrent leurs titres de mots-clés,
 * une recherche "accessoires voyage" remonte donc régulièrement des articles
 * sans rapport. On exige que le titre mentionne vraiment le sujet du rayon.
 */
import type { Universe } from '@prisma/client';

export interface ShopCategorySeed {
  slug: string;
  nameFr: string;
  emoji: string;
  universe?: Universe;
  sortOrder: number;
  searchTerms: string[];
  keywords: string[];
}

export const SHOP_CATEGORIES: ShopCategorySeed[] = [
  {
    slug: 'voyage',
    nameFr: 'Accessoires de voyage',
    emoji: '🧳',
    universe: 'travel_agency',
    sortOrder: 10,
    searchTerms: ['organisateur valise voyage', 'trousse de toilette voyage', 'adaptateur prise universel', 'oreiller de voyage', 'cadenas TSA bagage'],
    keywords: ['voyage', 'valise', 'bagage', 'trolley', 'passeport', 'cabine'],
  },
  {
    slug: 'gadgets-tech',
    nameFr: 'Gadgets & électronique',
    emoji: '🎧',
    sortOrder: 20,
    searchTerms: ['batterie externe usb c', 'traceur gps bagage', 'ecouteurs bluetooth sport', 'chargeur sans fil voyage', 'mini drone camera'],
    keywords: ['batterie', 'powerbank', 'chargeur', 'ecouteur', 'casque', 'drone', 'gps', 'usb', 'bluetooth', 'camera'],
  },
  {
    slug: 'plage-vacances',
    nameFr: 'Plage & vacances',
    emoji: '🏖️',
    universe: 'beach',
    sortOrder: 30,
    searchTerms: ['serviette plage microfibre', 'sac etanche plage', 'parasol portable plage', 'matelas gonflable plage'],
    keywords: ['plage', 'mer', 'sable', 'balneaire', 'serviette', 'parasol', 'etanche'],
  },
  {
    slug: 'randonnee',
    nameFr: 'Randonnée & trek',
    emoji: '🥾',
    universe: 'hiking',
    sortOrder: 40,
    searchTerms: ['sac a dos randonnee', 'batons de randonnee', 'gourde filtrante randonnee', 'lampe frontale randonnee'],
    keywords: ['randonnee', 'trek', 'montagne', 'trekking', 'bivouac', 'marche', 'outdoor'],
  },
  {
    slug: 'camping',
    nameFr: 'Camping & glamping',
    emoji: '⛺',
    universe: 'camping',
    sortOrder: 50,
    searchTerms: ['tente camping 2 places', 'sac de couchage camping', 'rechaud camping gaz', 'lanterne camping led'],
    keywords: ['camping', 'tente', 'bivouac', 'couchage', 'rechaud', 'glamping', 'campement'],
  },
  {
    slug: 'pique-nique',
    nameFr: 'Pique-nique',
    emoji: '🧺',
    universe: 'picnic_area',
    sortOrder: 60,
    searchTerms: ['panier pique nique', 'glaciere isotherme', 'nappe pique nique impermeable', 'couverts reutilisables pique nique'],
    keywords: ['pique-nique', 'pique nique', 'panier', 'glaciere', 'isotherme', 'nappe'],
  },
  {
    slug: 'piscine-aquatique',
    nameFr: 'Piscine & aquatique',
    emoji: '🏊',
    universe: 'aquatic',
    sortOrder: 70,
    searchTerms: ['masque snorkeling', 'lunettes natation adulte', 'bouee gonflable piscine', 'sac etanche natation'],
    keywords: ['piscine', 'natation', 'nage', 'snorkeling', 'plongee', 'aquatique', 'bouee', 'palmes'],
  },
  {
    slug: 'sport',
    nameFr: 'Équipement sportif',
    emoji: '🏋️',
    universe: 'sporting_goods',
    sortOrder: 80,
    searchTerms: ['bandes elastiques fitness', 'corde a sauter fitness', 'tapis de sport', 'gants musculation'],
    keywords: ['sport', 'fitness', 'musculation', 'entrainement', 'gym', 'workout', 'cardio'],
  },
  {
    slug: 'yoga-bien-etre',
    nameFr: 'Yoga & bien-être',
    emoji: '🧘',
    universe: 'yoga_studio',
    sortOrder: 90,
    searchTerms: ['tapis de yoga antiderapant', 'brique yoga liege', 'sangle yoga etirement', 'pistolet massage muscles'],
    keywords: ['yoga', 'pilates', 'meditation', 'massage', 'relaxation', 'etirement', 'bien-etre'],
  },
  {
    slug: 'coiffure-beaute',
    nameFr: 'Coiffure & beauté',
    emoji: '💇',
    universe: 'hair_salon',
    sortOrder: 100,
    searchTerms: ['lisseur cheveux professionnel', 'seche cheveux ionique', 'brosse chauffante cheveux', 'accessoires coiffure professionnel'],
    keywords: ['cheveux', 'coiffure', 'lisseur', 'boucleur', 'brosse', 'seche-cheveux', 'capillaire'],
  },
  {
    slug: 'barbier',
    nameFr: 'Barbier & rasage',
    emoji: '💈',
    universe: 'barber',
    sortOrder: 110,
    searchTerms: ['tondeuse barbe professionnelle', 'kit entretien barbe', 'rasoir de surete', 'ciseaux barbier'],
    keywords: ['barbe', 'barbier', 'rasage', 'rasoir', 'tondeuse', 'moustache'],
  },
  {
    slug: 'onglerie',
    nameFr: 'Onglerie',
    emoji: '💅',
    universe: 'nail_salon',
    sortOrder: 120,
    searchTerms: ['lampe uv led ongles', 'ponceuse ongles electrique', 'kit manucure professionnel', 'vernis semi permanent'],
    keywords: ['ongle', 'manucure', 'pedicure', 'vernis', 'nail', 'onglerie'],
  },
  {
    slug: 'cils-sourcils',
    nameFr: 'Cils & sourcils',
    emoji: '👁️',
    universe: 'lash_studio',
    sortOrder: 130,
    searchTerms: ['extension de cils professionnel', 'pince a cils', 'kit rehaussement cils', 'teinture sourcils'],
    keywords: ['cils', 'sourcil', 'extension', 'rehaussement', 'lash', 'brow'],
  },
  {
    slug: 'tatouage-piercing',
    nameFr: 'Tatouage & piercing',
    emoji: '🖋️',
    universe: 'tattoo',
    sortOrder: 140,
    // Volontairement limité aux accessoires légaux à la vente au grand public :
    // aiguilles, dermographes et matériel de perçage relèvent en France du
    // matériel réglementé et sont exclus (voir BANNED_KEYWORDS).
    searchTerms: ['bijou piercing titane', 'creme soin tatouage', 'tatouage temporaire adulte', 'pochoir tatouage temporaire'],
    keywords: ['tatouage', 'tattoo', 'piercing', 'bijou de corps', 'temporaire'],
  },
  {
    slug: 'fleuriste',
    nameFr: 'Fleurs & plantes',
    emoji: '💐',
    universe: 'florist',
    sortOrder: 150,
    searchTerms: ['vase decoratif moderne', 'secateur jardinage', 'fleurs artificielles decoration', 'cache pot plante'],
    keywords: ['fleur', 'plante', 'vase', 'bouquet', 'jardinage', 'pot', 'floral'],
  },
  {
    slug: 'animalerie',
    nameFr: 'Animalerie',
    emoji: '🐾',
    universe: 'pet_store',
    sortOrder: 160,
    searchTerms: ['harnais chien promenade', 'jouet chat interactif', 'sac transport animal', 'gamelle chien inox'],
    keywords: ['chien', 'chat', 'animal', 'animaux', 'harnais', 'laisse', 'gamelle', 'niche'],
  },
  {
    slug: 'cuisine',
    nameFr: 'Équipement cuisine',
    emoji: '🍳',
    universe: 'restaurant',
    sortOrder: 170,
    searchTerms: ['ustensiles cuisine silicone', 'couteau chef professionnel', 'balance cuisine precision', 'organisateur cuisine rangement'],
    keywords: ['cuisine', 'ustensile', 'couteau', 'casserole', 'poele', 'culinaire', 'chef'],
  },
  {
    slug: 'bricolage',
    nameFr: 'Bricolage & outils',
    emoji: '🔧',
    sortOrder: 180,
    searchTerms: ['set tournevis precision', 'metre laser telemetre', 'perceuse sans fil', 'boite a outils complete'],
    keywords: ['outil', 'bricolage', 'tournevis', 'perceuse', 'visseuse', 'cle', 'atelier'],
  },
  {
    slug: 'photo-creation',
    nameFr: 'Photo & création',
    emoji: '📸',
    universe: 'photo_spot',
    sortOrder: 190,
    searchTerms: ['trepied smartphone photo', 'ring light photo', 'stabilisateur gimbal smartphone', 'objectif clip smartphone'],
    keywords: ['photo', 'trepied', 'ring light', 'gimbal', 'stabilisateur', 'objectif', 'video'],
  },
  {
    slug: 'cafe-the',
    nameFr: 'Café & thé',
    emoji: '☕',
    universe: 'cafe',
    sortOrder: 200,
    searchTerms: ['moulin a cafe manuel', 'cafetiere italienne', 'theiere en verre', 'accessoires barista'],
    keywords: ['cafe', 'the', 'barista', 'cafetiere', 'theiere', 'moulin', 'infuseur'],
  },
  {
    slug: 'vin-apero',
    nameFr: 'Vin & apéro',
    emoji: '🍷',
    universe: 'wine_cellar',
    sortOrder: 210,
    searchTerms: ['tire bouchon electrique', 'carafe a decanter vin', 'aerateur de vin', 'sac isotherme bouteille'],
    keywords: ['vin', 'bouteille', 'tire-bouchon', 'tire bouchon', 'carafe', 'decanteur', 'apero', 'sommelier'],
  },
  {
    slug: 'auto-moto',
    nameFr: 'Auto & moto',
    emoji: '🚗',
    universe: 'garage',
    sortOrder: 220,
    searchTerms: ['organisateur coffre voiture', 'support telephone voiture', 'aspirateur voiture portable', 'housse moto impermeable'],
    keywords: ['voiture', 'auto', 'moto', 'vehicule', 'coffre', 'pare-brise', 'volant'],
  },
  {
    slug: 'velo-mobilite',
    nameFr: 'Vélo & mobilité',
    emoji: '🚲',
    sortOrder: 230,
    searchTerms: ['antivol velo securite', 'sacoche velo etanche', 'eclairage velo led', 'casque velo adulte'],
    keywords: ['velo', 'cycliste', 'cyclisme', 'trottinette', 'antivol', 'sacoche', 'guidon'],
  },
  {
    slug: 'soiree-karaoke',
    nameFr: 'Soirée & karaoké',
    emoji: '🎤',
    universe: 'karaoke',
    sortOrder: 240,
    searchTerms: ['micro karaoke bluetooth', 'jeu de lumiere soiree', 'machine a bulles fete', 'guirlande led soiree'],
    keywords: ['karaoke', 'micro', 'soiree', 'fete', 'lumiere', 'disco', 'led'],
  },
  {
    slug: 'lecture',
    nameFr: 'Lecture & bureau',
    emoji: '📚',
    universe: 'bookstore',
    sortOrder: 250,
    searchTerms: ['lampe de lecture rechargeable', 'support livre lecture', 'marque page magnetique', 'organisateur bureau'],
    keywords: ['livre', 'lecture', 'liseuse', 'marque-page', 'bureau', 'papeterie', 'carnet'],
  },
];

/**
 * Articles gadgets/déco qui remontent constamment parce que leur titre
 * mentionne le sujet du rayon en passant (porte-clés "voyage", figurine
 * "chien") sans être le produit attendu.
 */
export const JUNK_KEYWORDS = [
  'porte-cles', 'porte cles', 'pendentif', 'autocollant', 'sticker', 'breloque',
  'presentoir', 'figurine', 'aimant', 'badge', 'epingle', 'broche', 'coque de telephone',
  'boucle d oreille', 'miniature', 'poster', 'carte postale',
];

/**
 * Interdits absolus, pour deux raisons distinctes :
 *  - contrefaçon : AliExpress regorge de copies de marques déposées, les
 *    revendre expose directement YUMIA (nous sommes le vendeur légal) ;
 *  - matériel réglementé : aiguilles et dermographes de tatouage, matériel de
 *    perçage, lentilles de contact... sont des dispositifs dont la vente au
 *    grand public est encadrée voire interdite en France.
 */
export const BANNED_KEYWORDS = [
  // Marques fréquemment contrefaites
  'nike', 'adidas', 'gucci', 'louis vuitton', 'chanel', 'rolex', 'apple', 'airpods',
  'samsung', 'dior', 'prada', 'hermes', 'balenciaga', 'supreme', 'the north face',
  'disney', 'lego', 'nintendo', 'playstation', 'xbox',
  // Matériel réglementé / sensible
  'aiguille tatouage', 'aiguilles tatouage', 'dermographe', 'machine a tatouer',
  'encre de tatouage', 'kit de percage', 'pistolet a percer', 'lentille de contact',
  'medicament', 'complement alimentaire', 'e-cigarette', 'cigarette electronique',
  'arme', 'couteau papillon', 'taser', 'laser pointeur',
];

/** Sans accents ni casse — les titres AliExpress sont très irréguliers. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function isRelevant(title: string, keywords: string[]): boolean {
  const t = normalize(title);
  return keywords.some((k) => t.includes(normalize(k)));
}

export function isJunk(title: string): boolean {
  const t = normalize(title);
  return JUNK_KEYWORDS.some((k) => t.includes(normalize(k)));
}

export function isBanned(title: string): boolean {
  const t = normalize(title);
  return BANNED_KEYWORDS.some((k) => t.includes(normalize(k)));
}
