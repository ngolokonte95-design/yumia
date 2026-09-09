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
  /**
   * Rayon parent, quand un rayon mérite d'être subdivisé. Un sous-rayon n'est
   * pas une tuile de plus sur l'accueil : il devient un onglet à l'intérieur de
   * son parent, dont la liste agrège les produits de tous ses enfants.
   *
   * Aucun rayon n'en utilise aujourd'hui — le mécanisme reste en place, testé,
   * parce qu'il coûte peu et qu'un rayon large finira par en avoir besoin.
   */
  parentSlug?: string;
}

export const SHOP_CATEGORIES: ShopCategorySeed[] = [
  {
    slug: 'voyage',
    nameFr: 'Accessoires de voyage',
    emoji: '🧳',
    universe: 'travel_agency',
    sortOrder: 10,
    searchTerms: ['organisateur valise voyage', 'trousse de toilette voyage', 'adaptateur prise universel', 'oreiller de voyage', 'cadenas TSA bagage', 'balance bagage electronique', 'sac de compression voyage', 'pochette passeport rfid', 'masque de sommeil voyage', 'etiquette bagage', 'flacons voyage silicone', 'sac week end cabine'],
    keywords: ['voyage', 'valise', 'bagage', 'trolley', 'passeport', 'cabine', 'oreiller', 'adaptateur', 'trousse', 'organisateur', 'cadenas', 'serrure'],
  },
  {
    slug: 'gadgets-tech',
    nameFr: 'Gadgets & électronique',
    emoji: '🎧',
    sortOrder: 20,
    searchTerms: ['batterie externe usb c', 'traceur gps bagage', 'ecouteurs bluetooth sport', 'chargeur sans fil voyage', 'mini drone camera', 'enceinte bluetooth portable', 'montre connectee sport', 'cle usb rapide', 'hub usb c multiport', 'camera sport etanche', 'lampe torche rechargeable', 'support ordinateur portable'],
    keywords: ['batterie', 'chargeur', 'ecouteur', 'casque', 'enceinte', 'montre', 'usb', 'bluetooth', 'gps', 'drone', 'camera', 'torche', 'hub', 'support'],
  },
  {
    slug: 'plage-vacances',
    nameFr: 'Plage & vacances',
    emoji: '🏖️',
    universe: 'beach',
    sortOrder: 30,
    searchTerms: ['serviette plage microfibre', 'sac etanche plage', 'parasol portable plage', 'matelas gonflable plage', 'chapeau paille plage', 'tapis de plage antisable', 'jeu raquettes plage', 'douche solaire portable', 'sandales plage antiderapantes', 'pochette telephone etanche', 'glaciere souple plage', 'hamac portable'],
    keywords: ['plage', 'mer', 'sable', 'balneaire', 'serviette', 'parasol', 'etanche', 'maillot', 'bouee', 'hamac', 'solaire', 'sandale', 'chapeau'],
  },
  {
    slug: 'randonnee',
    nameFr: 'Randonnée & trek',
    emoji: '🥾',
    universe: 'hiking',
    sortOrder: 40,
    searchTerms: ['sac a dos randonnee', 'batons de randonnee', 'gourde filtrante randonnee', 'lampe frontale randonnee', 'chaussettes randonnee', 'poncho pluie randonnee', 'boussole orientation', 'trousse premiers secours randonnee', 'couverture de survie', 'guetres randonnee', 'sac hydratation', 'couteau multifonction randonnee'],
    keywords: ['randonnee', 'trekking', 'montagne', 'sac a dos', 'baton', 'gourde', 'frontale', 'boussole', 'survie', 'poncho', 'chaussette', 'couteau', 'secours', 'hydratation'],
  },
  {
    slug: 'camping',
    nameFr: 'Camping & glamping',
    emoji: '⛺',
    universe: 'camping',
    sortOrder: 50,
    searchTerms: ['tente camping 2 places', 'sac de couchage camping', 'rechaud camping gaz', 'lanterne camping led', 'matelas autogonflant camping', 'chaise pliante camping', 'table pliante camping', 'popote camping inox', 'hamac suspendu camping', 'bache tarp camping', 'glaciere electrique camping', 'allume feu camping'],
    keywords: ['camping', 'tente', 'bivouac', 'couchage', 'rechaud', 'lanterne', 'matelas', 'hamac', 'popote', 'glaciere', 'tarp', 'chaise', 'table'],
  },
  {
    slug: 'pique-nique',
    nameFr: 'Pique-nique',
    emoji: '🧺',
    universe: 'picnic_area',
    sortOrder: 60,
    searchTerms: ['panier pique nique', 'glaciere isotherme', 'nappe pique nique impermeable', 'couverts reutilisables pique nique', 'plaid pique nique impermeable', 'boite repas compartiment', 'sac isotherme dejeuner', 'planche apero bois', 'gourde isotherme', 'moulin poivre sel voyage', 'verres incassables plein air', 'tire bouchon pique nique'],
    keywords: ['pique-nique', 'pique nique', 'panier', 'glaciere', 'isotherme', 'nappe', 'plaid', 'couvert', 'gourde', 'apero', 'planche', 'boite repas', 'lunch', 'thermos', 'moulin', 'verre'],
  },
  {
    slug: 'piscine-aquatique',
    nameFr: 'Piscine & aquatique',
    emoji: '🏊',
    universe: 'aquatic',
    sortOrder: 70,
    searchTerms: ['masque snorkeling', 'lunettes natation adulte', 'bouee gonflable piscine', 'sac etanche natation', 'palmes natation', 'bonnet de bain silicone', 'planche natation', 'thermometre piscine', 'epuisette piscine', 'jouets plongee piscine', 'peignoir microfibre', 'brassards enfant piscine'],
    keywords: ['piscine', 'natation', 'snorkeling', 'plongee', 'aquatique', 'bouee', 'palme', 'lunette', 'bonnet', 'maillot', 'peignoir', 'brassard', 'epuisette'],
  },
  {
    slug: 'sport',
    nameFr: 'Équipement sportif',
    emoji: '🏋️',
    universe: 'sporting_goods',
    sortOrder: 80,
    searchTerms: ['bandes elastiques fitness', 'corde a sauter fitness', 'tapis de sport', 'gants musculation', 'halteres reglables', 'roue abdominaux', 'ceinture lombaire musculation', 'sangles suspension entrainement', 'montre cardio sport', 'shaker proteine', 'rouleau massage mousse', 'sac de sport homme'],
    keywords: ['fitness', 'musculation', 'sport', 'entrainement', 'elastique', 'haltere', 'corde', 'tapis', 'gant', 'abdominaux', 'cardio', 'shaker', 'massage'],
  },
  {
    slug: 'yoga-bien-etre',
    nameFr: 'Yoga & bien-être',
    emoji: '🧘',
    universe: 'yoga_studio',
    sortOrder: 90,
    searchTerms: ['tapis de yoga antiderapant', 'brique yoga liege', 'sangle yoga etirement', 'pistolet massage muscles', 'coussin meditation', 'roue yoga dos', 'diffuseur huiles essentielles', 'balles massage pieds', 'hamac yoga aerien', 'bandeau yeux relaxation', 'bol tibetain', 'tapis acupression'],
    keywords: ['yoga', 'meditation', 'pilates', 'etirement', 'massage', 'relaxation', 'tapis', 'brique', 'sangle', 'coussin', 'diffuseur', 'acupression', 'bol'],
  },
  {
    slug: 'coiffure-beaute',
    nameFr: 'Coiffure & beauté',
    emoji: '💇',
    universe: 'hair_salon',
    sortOrder: 100,
    searchTerms: ['lisseur cheveux professionnel', 'seche cheveux ionique', 'brosse chauffante cheveux', 'boucleur automatique cheveux', 'peigne demelant cheveux', 'miroir maquillage lumineux', 'pinceaux maquillage set', 'bigoudis chauffants', 'diffuseur boucles seche cheveux', 'ciseaux coiffure professionnel', 'cape coiffure salon', 'pince cheveux professionnelle'],
    keywords: ['cheveux', 'coiffure', 'lisseur', 'boucleur', 'seche-cheveux', 'seche cheveux', 'brosse', 'peigne', 'bigoudi', 'maquillage', 'pinceau', 'miroir', 'ciseaux'],
  },
  {
    slug: 'barbier',
    nameFr: 'Barbier & rasage',
    emoji: '💈',
    universe: 'barber',
    sortOrder: 110,
    searchTerms: ['tondeuse barbe professionnelle', 'kit entretien barbe', 'rasoir de surete', 'ciseaux barbier', 'huile a barbe', 'blaireau rasage', 'tondeuse cheveux professionnelle', 'miroir barbier', 'peigne barbe bois', 'baume a barbe', 'tondeuse nez oreilles', 'serviette barbier chauffante'],
    keywords: ['barbe', 'rasage', 'rasoir', 'tondeuse', 'barbier', 'moustache', 'blaireau', 'peigne', 'huile', 'baume', 'ciseaux'],
  },
  {
    slug: 'onglerie',
    nameFr: 'Onglerie',
    emoji: '💅',
    universe: 'nail_salon',
    sortOrder: 120,
    searchTerms: ['lampe uv led ongles', 'ponceuse ongles electrique', 'kit manucure professionnel', 'vernis semi permanent', 'faux ongles capsules', 'pinceaux nail art', 'strass decoration ongles', 'repose main manucure', 'aspirateur poussiere ongles', 'coupe ongles professionnel', 'base coat top coat', 'stickers ongles'],
    keywords: ['ongle', 'manucure', 'pedicure', 'vernis', 'nail', 'capsule', 'ponceuse', 'lampe uv', 'strass', 'coupe-ongles', 'cuticule', 'coat'],
  },
  {
    slug: 'cils-sourcils',
    nameFr: 'Cils & sourcils',
    emoji: '👁️',
    universe: 'lash_studio',
    sortOrder: 130,
    searchTerms: ['extension de cils professionnel', 'pince a cils', 'kit rehaussement cils', 'teinture sourcils', 'colle extension cils', 'pincettes precision cils', 'serum croissance cils', 'pochoir sourcils', 'brosse sourcils', 'lampe loupe estheticienne', 'patch hydrogel yeux', 'recourbe cils chauffant'],
    keywords: ['cil', 'cils', 'sourcil', 'sourcils', 'extension', 'rehaussement', 'mascara', 'teinture', 'pince', 'pochoir', 'serum', 'hydrogel', 'loupe', 'lampe'],
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
    searchTerms: ['bijou piercing titane', 'creme soin tatouage', 'tatouage temporaire adulte', 'pochoir tatouage temporaire', 'film protecteur tatouage', 'anneau septum acier', 'boucle oreille chirurgicale', 'pansement tatouage', 'baume apres tatouage', 'piercing nombril acier', 'gants nitrile noir', 'lampe loupe studio'],
    keywords: ['tatouage', 'tattoo', 'piercing', 'bijou de corps', 'temporaire', 'septum', 'nombril', 'anneau', 'pochoir', 'pansement', 'nitrile', 'boucle', 'loupe', 'lampe'],
  },
  {
    slug: 'fleuriste',
    nameFr: 'Fleurs & plantes',
    emoji: '💐',
    universe: 'florist',
    sortOrder: 150,
    searchTerms: ['vase decoratif moderne', 'secateur jardinage', 'fleurs artificielles decoration', 'cache pot plante', 'mousse florale', 'ruban satin fleuriste', 'arrosoir decoratif', 'papier kraft bouquet', 'support plante interieur', 'ciseaux floraux', 'guirlande fleurs artificielles', 'brumisateur plantes'],
    keywords: ['fleur', 'plante', 'vase', 'bouquet', 'jardinage', 'pot', 'floral', 'secateur', 'arrosoir', 'mousse', 'ruban', 'kraft', 'brumisateur', 'ciseaux'],
  },
  {
    slug: 'animalerie',
    nameFr: 'Animalerie',
    emoji: '🐾',
    universe: 'pet_store',
    sortOrder: 160,
    searchTerms: ['harnais chien promenade', 'jouet chat interactif', 'sac transport animal', 'gamelle chien inox', 'arbre a chat', 'brosse poils animaux', 'laisse retractable chien', 'litiere chat automatique', 'coussin panier chien', 'distributeur croquettes', 'collier lumineux chien', 'griffoir chat'],
    keywords: ['chien', 'chat', 'animal', 'animaux', 'harnais', 'laisse', 'gamelle', 'niche', 'griffoir', 'litiere', 'croquette', 'collier', 'panier'],
  },
  {
    slug: 'cuisine',
    nameFr: 'Équipement cuisine',
    emoji: '🍳',
    universe: 'restaurant',
    sortOrder: 170,
    searchTerms: ['ustensiles cuisine silicone', 'couteau chef professionnel', 'balance cuisine precision', 'organisateur cuisine rangement', 'mandoline legumes', 'planche a decouper bambou', 'robot petrin manuel', 'moule patisserie silicone', 'thermometre cuisine', 'presse ail inox', 'essoreuse salade', 'boites conservation hermetiques'],
    keywords: ['cuisine', 'ustensile', 'couteau', 'casserole', 'poele', 'culinaire', 'chef', 'planche', 'mandoline', 'moule', 'balance', 'thermometre', 'conservation', 'patisserie', 'robot', 'petrin', 'presse', 'essoreuse'],
  },
  {
    slug: 'bricolage',
    nameFr: 'Bricolage & outils',
    emoji: '🔧',
    sortOrder: 180,
    searchTerms: ['set tournevis precision', 'metre laser telemetre', 'perceuse sans fil', 'boite a outils complete', 'pistolet a colle chaude', 'niveau laser croix', 'pince multiprise', 'scie sauteuse', 'detecteur metaux mur', 'etabli pliant', 'visserie assortiment', 'lunettes protection bricolage'],
    keywords: ['outil', 'bricolage', 'tournevis', 'perceuse', 'visseuse', 'cle', 'atelier', 'scie', 'niveau', 'laser', 'etabli', 'pince', 'marteau', 'vis', 'colle', 'detecteur', 'protection', 'visserie'],
  },
  {
    slug: 'photo-creation',
    nameFr: 'Photo & création',
    emoji: '📸',
    universe: 'photo_spot',
    sortOrder: 190,
    searchTerms: ['trepied smartphone photo', 'ring light photo', 'stabilisateur gimbal smartphone', 'objectif clip smartphone', 'fond studio photo', 'micro cravate smartphone', 'softbox eclairage studio', 'teleprompteur smartphone', 'filtre objectif photo', 'carte memoire rapide', 'sac photo appareil', 'declencheur bluetooth photo'],
    keywords: ['photo', 'trepied', 'ring light', 'gimbal', 'stabilisateur', 'objectif', 'studio', 'eclairage', 'micro', 'softbox', 'filtre', 'carte memoire', 'declencheur', 'teleprompteur'],
  },
  {
    slug: 'cafe-the',
    nameFr: 'Café & thé',
    emoji: '☕',
    universe: 'cafe',
    sortOrder: 200,
    searchTerms: ['moulin a cafe manuel', 'cafetiere italienne', 'theiere en verre', 'accessoires barista', 'presse francaise cafe', 'mousseur a lait', 'balance cafe precision', 'filtre cafe reutilisable', 'boite conservation cafe', 'infuseur the inox', 'tasses expresso', 'tamper cafe'],
    keywords: ['cafe', 'the', 'barista', 'cafetiere', 'theiere', 'moulin', 'expresso', 'infuseur', 'mousseur', 'filtre', 'tasse', 'tamper'],
  },
  {
    slug: 'meuble-deco',
    nameFr: 'Meuble & déco',
    emoji: '🛋️',
    sortOrder: 210,
    searchTerms: ['etagere murale bois', 'meuble rangement modulable', 'coussin decoratif salon', 'tapis salon moderne', 'suspension luminaire design', 'miroir decoratif mural', 'cadre photo mural', 'plante artificielle decoration', 'rideau occultant chambre', 'organiseur rangement modulable', 'table appoint pliante', 'guirlande led decoration interieure'],
    keywords: ['meuble', 'etagere', 'rangement', 'coussin', 'tapis', 'luminaire', 'suspension', 'miroir', 'cadre', 'decoration', 'rideau', 'table', 'guirlande', 'deco'],
  },
  {
    slug: 'auto-moto',
    nameFr: 'Auto & moto',
    emoji: '🚗',
    universe: 'garage',
    sortOrder: 220,
    searchTerms: ['organisateur coffre voiture', 'support telephone voiture', 'aspirateur voiture portable', 'housse moto impermeable', 'camera de recul voiture', 'compresseur pneu portable', 'chargeur allume cigare', 'tapis de sol voiture', 'gants moto ete', 'antivol moto disque', 'nettoyant jantes', 'pare soleil voiture'],
    keywords: ['voiture', 'auto', 'moto', 'vehicule', 'coffre', 'pneu', 'allume-cigare', 'allume cigare', 'tapis de sol', 'housse', 'camera de recul', 'jante', 'pare-soleil', 'casque', 'gant'],
  },
  {
    slug: 'velo-mobilite',
    nameFr: 'Vélo & mobilité',
    emoji: '🚲',
    sortOrder: 230,
    searchTerms: ['antivol velo securite', 'sacoche velo etanche', 'eclairage velo led', 'casque velo adulte', 'pompe velo portable', 'compteur velo sans fil', 'support telephone velo', 'kit reparation crevaison', 'porte bidon velo', 'gants velo rembourres', 'remorque velo bagages', 'selle velo confort'],
    keywords: ['velo', 'cycliste', 'cyclisme', 'trottinette', 'antivol', 'sacoche', 'casque', 'pompe', 'compteur', 'selle', 'crevaison', 'bidon', 'eclairage'],
  },
  {
    slug: 'soiree-karaoke',
    nameFr: 'Soirée & karaoké',
    emoji: '🎤',
    universe: 'karaoke',
    sortOrder: 240,
    searchTerms: ['micro karaoke bluetooth', 'jeu de lumiere soiree', 'machine a bulles fete', 'guirlande led soiree', 'machine a fumee', 'boule disco led', 'projecteur laser soiree', 'ballons decoration fete', 'photobooth accessoires', 'enceinte karaoke', 'confettis canon', 'masque led fete'],
    keywords: ['karaoke', 'soiree', 'fete', 'micro', 'lumiere', 'disco', 'led', 'fumee', 'bulle', 'ballon', 'confetti', 'guirlande', 'photobooth', 'enceinte'],
  },
  {
    slug: 'lecture',
    nameFr: 'Lecture & bureau',
    emoji: '📚',
    universe: 'bookstore',
    sortOrder: 250,
    searchTerms: ['lampe de lecture rechargeable', 'support livre lecture', 'marque page magnetique', 'organisateur bureau', 'liseuse housse protection', 'coussin lecture lit', 'serre livres decoratifs', 'carnet cuir notes', 'stylo plume calligraphie', 'loupe lecture eclairee', 'plaid lecture polaire', 'etagere murale livres'],
    keywords: ['livre', 'lecture', 'liseuse', 'marque-page', 'marque page', 'bureau', 'lampe', 'carnet', 'stylo', 'loupe', 'etagere', 'serre-livres', 'plaid'],
  },
  {
    slug: 'bijoux-montres',
    nameFr: 'Bijoux & montres',
    emoji: '💍',
    universe: 'jewelry',
    sortOrder: 260,
    searchTerms: ['collier acier inoxydable femme', 'bracelet cuir homme', 'montre automatique homme', 'boucles oreilles argent', 'bague acier femme', 'montre femme bracelet maille', 'chaine cheville', 'coffret rangement bijoux', 'bracelet perles pierre naturelle', 'pendentif argent 925', 'montre digitale sport', 'broche vintage'],
    keywords: ['bijou', 'collier', 'bracelet', 'bague', 'montre', 'pendentif', 'chaine', 'boucle', 'argent', 'acier', 'perle', 'broche', 'cheville', 'coffret', 'boucle d oreille'],
  },
  {
    slug: 'jouets-cadeaux',
    nameFr: 'Jouets & cadeaux',
    emoji: '🎁',
    sortOrder: 280,
    searchTerms: ['peluche geante douce', 'jeu de societe famille', 'puzzle 1000 pieces', 'jouet montessori bois', 'circuit voiture enfant', 'kit science enfant', 'jeu de construction briques', 'poupee chiffon', 'coffret cadeau noel', 'calendrier avent reutilisable', 'jeu de cartes famille', 'veilleuse enfant projection'],
    keywords: ['jouet', 'jeu', 'peluche', 'puzzle', 'poupee', 'montessori', 'construction', 'circuit', 'cadeau', 'noel', 'coffret', 'veilleuse', 'avent', 'carte', 'brique', 'figurine', 'science'],
  },
  {
    slug: 'bureau-teletravail',
    nameFr: 'Bureau & télétravail',
    emoji: '💻',
    universe: 'coworking',
    sortOrder: 290,
    searchTerms: ['support ecran ordinateur', 'lampe bureau led', 'tapis de bureau cuir', 'organisateur bureau tiroir', 'repose poignet clavier', 'support ordinateur portable reglable', 'chaise ergonomique coussin', 'repose pieds bureau', 'passe cable bureau', 'webcam hd bureau', 'casque anti bruit bureau', 'horloge bureau minimaliste'],
    keywords: ['bureau', 'ecran', 'lampe', 'tapis', 'organisateur', 'clavier', 'souris', 'ordinateur', 'ergonomique', 'repose', 'cable', 'webcam', 'casque', 'horloge', 'chaise', 'coussin'],
  },
  {
    slug: 'loisirs-creatifs',
    nameFr: 'Loisirs créatifs',
    emoji: '🎨',
    sortOrder: 300,
    searchTerms: ['peinture par numero adulte', 'diamond painting kit', 'carnet croquis papier epais', 'pinceaux peinture acrylique', 'set aquarelle professionnel', 'pistolet colle loisirs creatifs', 'perles rocaille bijoux', 'kit crochet debutant', 'papier origami couleur', 'marqueurs alcool dessin', 'argile polymere modelage', 'tampons encreurs scrapbooking'],
    keywords: ['peinture', 'dessin', 'aquarelle', 'pinceau', 'carnet', 'croquis', 'diamond', 'perle', 'crochet', 'tricot', 'origami', 'marqueur', 'argile', 'modelage', 'scrapbooking', 'tampon', 'colle', 'creatif', 'papier'],
  },
  {
    slug: 'spa-massage',
    nameFr: 'Spa & massage',
    emoji: '💆',
    universe: 'spa',
    sortOrder: 310,
    searchTerms: ['huile de massage relaxante', 'pierres chaudes massage', 'bain de pieds massant', 'peignoir microfibre spa', 'bougie parfumee massage', 'appareil massage nuque', 'brosse seche corps', 'masque visage tissu', 'sels de bain relaxants', 'coussin chauffant cervical', 'ventouse massage silicone', 'gant exfoliant corps'],
    keywords: ['massage', 'spa', 'relaxation', 'huile', 'pierre', 'bain', 'peignoir', 'bougie', 'nuque', 'brosse', 'masque', 'sel', 'coussin', 'chauffant', 'ventouse', 'exfoliant', 'gant'],
  },
  {
    slug: 'cinema-maison',
    nameFr: 'Soirée cinéma',
    emoji: '🍿',
    universe: 'cinema',
    sortOrder: 320,
    searchTerms: ['mini projecteur portable', 'ecran de projection pliable', 'machine a popcorn maison', 'barre de son tv', 'support tablette lit', 'lampe led ambiance tv', 'plaid canape polaire', 'coussin de sol cinema', 'telecommande universelle tv', 'lunettes anti lumiere bleue', 'guirlande led salon', 'boite rangement telecommande'],
    keywords: ['projecteur', 'projection', 'ecran', 'popcorn', 'son', 'enceinte', 'support', 'tablette', 'lampe', 'plaid', 'coussin', 'telecommande', 'lunette', 'cinema', 'guirlande', 'canape'],
  },
  {
    slug: 'cake-design',
    nameFr: 'Pâtisserie & cake design',
    emoji: '🧁',
    universe: 'bakery',
    sortOrder: 330,
    searchTerms: ['moule silicone patisserie', 'poche a douille set', 'colorant alimentaire gel', 'tapis silicone patisserie', 'emporte piece patisserie', 'plateau tournant gateau', 'spatule lissante gateau', 'thermometre sucre cuisson', 'caissettes cupcake papier', 'decoration comestible gateau', 'rouleau texture pate a sucre', 'boite transport gateau'],
    keywords: ['patisserie', 'gateau', 'moule', 'douille', 'colorant', 'tapis', 'emporte', 'plateau', 'spatule', 'thermometre', 'caissette', 'cupcake', 'decoration', 'pate a sucre', 'rouleau', 'boite', 'silicone'],
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
  // Horlogerie et joaillerie, ou la contrefacon est la plus dense.
  'cartier', 'tiffany', 'pandora', 'swarovski', 'omega', 'patek philippe',
  'audemars', 'hublot', 'tag heuer', 'bvlgari', 'van cleef', 'michael kors',
  'daniel wellington', 'fossil', 'seiko', 'citizen', 'casio', 'longines',
  // Pret-a-porter et streetwear
  'burberry', 'lacoste', 'ralph lauren', 'tommy hilfiger', 'calvin klein',
  'puma', 'under armour', 'new balance', 'jordan', 'yeezy', 'stone island',
  'moncler', 'canada goose', 'versace', 'fendi', 'givenchy', 'off-white',
  // Licences de jouets
  'barbie', 'pokemon', 'marvel', 'hello kitty', 'paw patrol', 'peppa',
  'spiderman', 'mickey', 'pixar', 'hasbro', 'mattel', 'funko', 'disneyland',
  'harry potter', 'star wars', 'batman', 'sonic', 'minecraft', 'roblox',
];

/** Sans accents ni casse — les titres AliExpress sont très irréguliers. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Terme présent dans le titre, sur des FRONTIÈRES DE MOT.
 *
 * Une simple recherche de sous-chaîne paraissait suffisante et ne l'était pas :
 * « arme » bloquait « alarme », « charme » et « gendarmerie », donc tous les
 * antivols de vélo et alarmes de voiture disparaissaient du catalogue sans que
 * rien ne le signale ; « hermes » bloquait « thermes ». Dans l'autre sens, le
 * mot-clé « cle » du rayon bricolage rendait pertinents « boucle » et
 * « spectacle ».
 *
 * Le `s`/`x` final optionnel évite de devoir lister chaque pluriel.
 */
function containsTerm(normalizedTitle: string, term: string): boolean {
  // Séparateurs souples entre les mots du terme : « boucle d oreille » doit
  // reconnaître « boucle d'oreille », et « pique-nique » reconnaître
  // « pique nique ». Les vendeurs écrivent les deux, indifféremment.
  const words = normalize(term).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return false;
  const pattern = words.join('[^a-z0-9]+');
  return new RegExp(`(^|[^a-z0-9])${pattern}(s|x)?([^a-z0-9]|$)`).test(normalizedTitle);
}

export function isRelevant(title: string, keywords: string[]): boolean {
  const t = normalize(title);
  return keywords.some((k) => containsTerm(t, k));
}

/**
 * Camelote — mais relativement au rayon.
 *
 * « pendentif » et « boucle d'oreille » sont du bruit dans le rayon animalerie,
 * et exactement le produit recherche dans le rayon bijoux. Un mot de la liste
 * qui figure aussi parmi les mots-cles du rayon n'est donc pas de la camelote :
 * sans cette nuance, ouvrir un rayon bijouterie viderait ce rayon.
 */
export function isJunk(title: string, categoryKeywords: string[] = []): boolean {
  const t = normalize(title);
  const vendu = new Set(categoryKeywords.map(normalize));
  return JUNK_KEYWORDS.some((k) => !vendu.has(normalize(k)) && containsTerm(t, k));
}

export function isBanned(title: string): boolean {
  const t = normalize(title);
  return BANNED_KEYWORDS.some((k) => containsTerm(t, k));
}

// ── Détection des quasi-doublons ────────────────────────────────────────────
//
// Une recherche AliExpress remonte les mieux classés d'un terme donné : sur
// « cadenas TSA bagage » on récupère donc dix annonces du même cadenas, publiées
// par des vendeurs différents. Les identifiants produit diffèrent, la
// déduplication par `aliexpressProductId` ne voit rien, et le rayon se retrouve
// avec cinq organisateurs de valise identiques — c'est ce que donnait le premier
// import du rayon voyage.
//
// On compare donc les titres. Les mots vides et le vocabulaire marketing sont
// écartés d'abord : « grande capacité portable multifonctionnel » se retrouve
// dans un titre sur deux et rapprocherait n'importe quoi de n'importe quoi.

const TITLE_STOPWORDS = new Set([
  'pour', 'avec', 'sans', 'dans', 'les', 'des', 'une', 'aux', 'sur', 'par', 'plus',
  'que', 'qui', 'est', 'sont', 'peut', 'etre', 'son', 'ses', 'leur', 'tout', 'tous',
  'grande', 'grand', 'petit', 'petite', 'nouveau', 'nouvelle', 'haute', 'haut',
  'capacite', 'qualite', 'portable', 'pratique', 'multifonctionnel', 'multifonction',
  'professionnel', 'universel', 'universelle', 'accessoire', 'accessoires',
  'set', 'kit', 'lot', 'pcs', 'pieces', 'piece', 'mode', 'style', 'design',
  'homme', 'femme', 'hommes', 'femmes', 'adulte', 'enfant', 'unisexe',
  'noir', 'blanc', 'rouge', 'bleu', 'vert', 'rose', 'gris', 'couleur',
]);

/**
 * Pluriel retiré, pour que « serrure » et « serrures » se rejoignent.
 *
 * On ne coupe que le `s`/`x` final : une règle plus ambitieuse qui retirerait
 * aussi `es` transformerait « serrures » en « serrur » alors que « serrure »
 * resterait entier — les deux mots ne se rencontreraient jamais, ce qui est
 * précisément le bug que ce raccourci évite.
 */
function stem(word: string): string {
  return word.length > 4 && (word.endsWith('s') || word.endsWith('x'))
    ? word.slice(0, -1)
    : word;
}

/** Mots porteurs de sens d'un titre, pour le comparer à un autre. */
export function titleSignature(title: string): Set<string> {
  return new Set(
    normalize(title)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w))
      .map(stem),
  );
}

/**
 * `true` si deux titres désignent visiblement le même genre de produit.
 *
 * On rapporte l'intersection au PLUS COURT des deux titres, pas à leur union :
 * les vendeurs AliExpress publient le même article tantôt en six mots, tantôt en
 * quarante, et un indice de Jaccard classique jugerait ces deux titres distincts
 * alors qu'il s'agit du même cadenas.
 *
 * Le seuil de 0,5 vient d'une mesure sur les titres réellement renvoyés lors du
 * premier import du rayon voyage : les doublons s'y situaient entre 0,50 et
 * 1,00, les produits réellement différents ne dépassant pas 0,33. La marge est
 * confortable, et le filtre est volontairement du côté sévère — écarter un
 * article valable coûte peu (le résultat suivant le remplace), afficher cinq
 * cadenas identiques coûte la crédibilité de la boutique.
 */
export function tooSimilar(a: Set<string>, b: Set<string>, threshold = 0.5): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size) >= threshold;
}
