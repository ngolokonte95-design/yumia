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
    searchTerms: ['organisateur valise voyage', 'trousse de toilette voyage', 'adaptateur prise universel', 'oreiller de voyage', 'cadenas TSA bagage', 'balance bagage electronique', 'sac de compression voyage', 'pochette passeport rfid', 'masque de sommeil voyage', 'etiquette bagage', 'flacons voyage silicone', 'sac week end cabine', 'valise cabine rigide', 'housse de valise protection', 'sangle valise securite', 'trousse cables voyage', 'coussin repose pieds avion', 'sac a dos antivol voyage', 'pochette ceinture voyage', 'kit voyage avion confort', 'chaussons voyage compressibles', 'organisateur chaussures valise', 'porte documents voyage', 'sac pliable supplementaire'],
    keywords: ['voyage', 'valise', 'bagage', 'trolley', 'passeport', 'cabine', 'oreiller', 'adaptateur', 'trousse', 'organisateur', 'cadenas', 'serrure', 'balance', 'housse', 'sangle', 'pochette', 'coussin', 'sac', 'etiquette', 'chausson', 'document', 'flacon', 'masque', 'kit'],
  },
  {
    slug: 'gadgets-tech',
    nameFr: 'Gadgets & électronique',
    emoji: '🎧',
    sortOrder: 20,
    searchTerms: ['ecouteurs bluetooth reduction bruit', 'ecouteurs sans fil sport', 'mini videoprojecteur portable', 'enceinte bluetooth design', 'enceinte bluetooth waterproof', 'montre connectee sport', 'bracelet connecte fitness', 'lunettes connectees audio', 'appareil photo instantane', 'manette gaming sans fil', 'casque gaming filaire', 'tapis souris xxl gaming', 'microphone podcast usb', 'micro cravate sans fil', 'bandeau led ambiance tv', 'lampe led ambiance rgb', 'drone camera pliable', 'mini drone debutant', 'platine vinyle bluetooth', 'liseuse ecran encre', 'webcam full hd', 'camera sport etanche', 'station recharge multifonction', 'batterie externe usb c', 'chargeur sans fil rapide', 'hub usb c multiport', 'lampe torche rechargeable', 'traceur gps objet'],
    keywords: ['ecouteur', 'casque', 'enceinte', 'videoprojecteur', 'projecteur', 'montre', 'bracelet', 'lunette', 'appareil photo', 'manette', 'gaming', 'tapis', 'microphone', 'micro', 'led', 'ambiance', 'drone', 'platine', 'vinyle', 'liseuse', 'webcam', 'camera', 'station', 'recharge', 'batterie', 'chargeur', 'hub', 'usb', 'torche', 'traceur', 'gps', 'bluetooth'],
  },
  {
    slug: 'plage-vacances',
    nameFr: 'Plage & vacances',
    emoji: '🏖️',
    universe: 'beach',
    sortOrder: 30,
    searchTerms: ['serviette plage microfibre', 'sac etanche plage', 'parasol portable plage', 'matelas gonflable plage', 'chapeau paille plage', 'tapis de plage antisable', 'jeu raquettes plage', 'douche solaire portable', 'sandales plage antiderapantes', 'pochette telephone etanche', 'glaciere souple plage', 'hamac portable', 'tente de plage anti uv', 'bouee gonflable geante', 'ballon plage gonflable', 'sac filet plage', 'brumisateur portable rechargeable', 'ventilateur portable rechargeable', 'lunettes soleil polarisees', 'paravent plage pliable', 'coffre rangement plage', 'poncho serviette surf', 'jeux sable enfant', 'support parasol sable'],
    keywords: ['plage', 'mer', 'sable', 'balneaire', 'serviette', 'parasol', 'etanche', 'maillot', 'bouee', 'hamac', 'solaire', 'sandale', 'chapeau', 'tente', 'ballon', 'filet', 'brumisateur', 'ventilateur', 'lunette', 'paravent', 'coffre', 'poncho', 'jeu', 'tapis', 'glaciere', 'douche', 'matelas', 'pochette', 'support'],
  },
  {
    slug: 'randonnee',
    nameFr: 'Randonnée & trek',
    emoji: '🥾',
    universe: 'hiking',
    sortOrder: 40,
    searchTerms: ['sac a dos randonnee', 'batons de randonnee', 'gourde filtrante randonnee', 'lampe frontale randonnee', 'chaussettes randonnee', 'poncho pluie randonnee', 'boussole orientation', 'trousse premiers secours randonnee', 'couverture de survie', 'guetres randonnee', 'sac hydratation', 'couteau multifonction randonnee', 'sifflet survie multifonction', 'pierre a feu allumage', 'filtre a eau portable', 'pochette etanche telechargement', 'genouillere randonnee', 'bache abri leger', 'corde paracorde survie', 'trepied bivouac', 'sac de couchage compact', 'matelas gonflable trek', 'housse pluie sac a dos', 'crampons neige chaussures'],
    keywords: ['randonnee', 'trekking', 'montagne', 'sac a dos', 'baton', 'gourde', 'frontale', 'boussole', 'survie', 'poncho', 'chaussette', 'couteau', 'secours', 'hydratation', 'sifflet', 'feu', 'filtre', 'pochette', 'genouillere', 'bache', 'corde', 'paracorde', 'trepied', 'couchage', 'matelas', 'housse', 'crampon', 'sac'],
  },
  {
    slug: 'camping',
    nameFr: 'Camping & glamping',
    emoji: '⛺',
    universe: 'camping',
    sortOrder: 50,
    searchTerms: ['tente camping 2 places', 'tente camping familiale', 'sac de couchage camping', 'rechaud camping gaz', 'lanterne camping led', 'matelas autogonflant camping', 'chaise pliante camping', 'table pliante camping', 'popote camping inox', 'hamac suspendu camping', 'bache tarp camping', 'glaciere electrique camping', 'allume feu camping', 'douche solaire camping', 'toilette portable camping', 'guirlande led camping', 'panneau solaire portable camping', 'ventilateur camping rechargeable', 'marteau sardines tente', 'tapis de sol tente', 'four camping portable', 'cafetiere camping outdoor', 'rangement suspendu tente', 'couverture picnic impermeable'],
    keywords: ['camping', 'tente', 'bivouac', 'couchage', 'rechaud', 'lanterne', 'matelas', 'hamac', 'popote', 'glaciere', 'tarp', 'chaise', 'table', 'douche', 'toilette', 'guirlande', 'panneau solaire', 'ventilateur', 'sardine', 'tapis', 'four', 'cafetiere', 'rangement', 'couverture', 'feu', 'bache', 'marteau'],
  },
  {
    slug: 'pique-nique',
    nameFr: 'Pique-nique',
    emoji: '🧺',
    universe: 'picnic_area',
    sortOrder: 60,
    searchTerms: ['panier pique nique', 'glaciere isotherme', 'nappe pique nique impermeable', 'couverts reutilisables pique nique', 'plaid pique nique impermeable', 'boite repas compartiment', 'sac isotherme dejeuner', 'planche apero bois', 'gourde isotherme', 'moulin poivre sel voyage', 'verres incassables plein air', 'tire bouchon pique nique', 'lunch box chauffante', 'set couteaux picnic', 'pack froid reutilisable', 'distributeur boisson picnic', 'table pliante picnic', 'coussin assise exterieur', 'sac a dos picnic equipe', 'boite salade nomade', 'thermos alimentaire soupe', 'serviettes tissu picnic', 'parasol table exterieur', 'panier osier rangement'],
    keywords: ['pique-nique', 'pique nique', 'picnic', 'panier', 'glaciere', 'isotherme', 'nappe', 'plaid', 'couvert', 'gourde', 'apero', 'planche', 'boite repas', 'lunch', 'thermos', 'moulin', 'verre', 'tire bouchon', 'pack froid', 'distributeur', 'table', 'coussin', 'sac', 'boite', 'serviette', 'parasol', 'osier', 'couteau'],
  },
  {
    slug: 'piscine-aquatique',
    nameFr: 'Piscine & aquatique',
    emoji: '🏊',
    universe: 'aquatic',
    sortOrder: 70,
    searchTerms: ['masque snorkeling', 'lunettes natation adulte', 'bouee gonflable piscine', 'sac etanche natation', 'palmes natation', 'bonnet de bain silicone', 'planche natation', 'thermometre piscine', 'epuisette piscine', 'jouets plongee piscine', 'peignoir microfibre', 'brassards enfant piscine', 'matelas gonflable piscine', 'fauteuil gonflable piscine', 'robot nettoyeur piscine', 'aspirateur piscine manuel', 'bache solaire piscine', 'echelle piscine hors sol', 'pistolet a eau enfant', 'tapis flottant piscine', 'chaussons aquatiques antiderapants', 'ceinture flottaison natation', 'pince nez natation', 'sac filet jouets piscine'],
    keywords: ['piscine', 'natation', 'snorkeling', 'plongee', 'aquatique', 'bouee', 'palme', 'lunette', 'bonnet', 'maillot', 'peignoir', 'brassard', 'epuisette', 'matelas', 'fauteuil', 'robot', 'aspirateur', 'bache', 'echelle', 'pistolet', 'tapis', 'chausson', 'ceinture', 'pince', 'filet', 'jouet', 'planche', 'thermometre', 'sac'],
  },
  {
    slug: 'sport',
    nameFr: 'Équipement sportif',
    emoji: '🏋️',
    universe: 'sporting_goods',
    sortOrder: 80,
    searchTerms: ['halteres reglables musculation', 'banc de musculation pliable', 'power tower station musculation', 'set halteres poids fonte', 'rack de musculation maison', 'home gym multifonction', 'velo appartement fitness', 'rameur appartement pliable', 'tapis de course pliable', 'barre de traction porte', 'barre de traction murale', 'poignees pompes rotatives', 'roue abdominaux double', 'banc abdominaux pliable', 'kettlebell reglable', 'bandes elastiques musculation', 'sangles suspension entrainement', 'corde a sauter lestee', 'gants musculation antiderapants', 'ceinture lombaire musculation', 'rouleau massage mousse', 'tapis de sol fitness epais', 'stepper fitness maison', 'disques poids olympiques', 'shaker proteine gradue', 'montre cardio sport'],
    keywords: ['haltere', 'banc', 'power tower', 'musculation', 'poids', 'rack', 'home gym', 'velo', 'appartement', 'rameur', 'tapis', 'course', 'barre', 'traction', 'pompe', 'abdominaux', 'kettlebell', 'elastique', 'sangle', 'corde', 'gant', 'ceinture', 'rouleau', 'massage', 'stepper', 'disque', 'shaker', 'montre', 'fitness', 'sport', 'entrainement'],
  },
  {
    slug: 'yoga-bien-etre',
    nameFr: 'Yoga & bien-être',
    emoji: '🧘',
    universe: 'yoga_studio',
    sortOrder: 90,
    searchTerms: ['pistolet massage muscles', 'pistolet massage percussion', 'appareil massage nuque epaules', 'coussin massant chauffant shiatsu', 'appareil massage pieds electrique', 'tapis acupression electrique', 'ceinture massage abdominale', 'appareil massage cervical', 'machine massage jambes compression', 'fauteuil massage portable', 'rouleau massage electrique', 'appareil electrostimulation muscles', 'tapis de yoga antiderapant', 'brique yoga liege', 'sangle yoga etirement', 'roue yoga dos', 'coussin meditation ergonomique', 'hamac yoga aerien', 'diffuseur huiles essentielles ultrasonique', 'humidificateur air chambre', 'lampe luminotherapie reveil', 'bandeau yeux chauffant relaxation', 'bol tibetain meditation', 'balles massage pieds', 'banc etirement dos', 'appareil traction cervicale'],
    keywords: ['massage', 'massant', 'pistolet', 'appareil', 'machine', 'yoga', 'meditation', 'pilates', 'etirement', 'relaxation', 'tapis', 'brique', 'sangle', 'coussin', 'roue', 'hamac', 'diffuseur', 'humidificateur', 'lampe', 'luminotherapie', 'bandeau', 'bol', 'balle', 'banc', 'traction', 'acupression', 'electrostimulation', 'fauteuil', 'rouleau', 'ceinture', 'nuque', 'cervical'],
  },
  {
    slug: 'coiffure-beaute',
    nameFr: 'Coiffure & beauté',
    emoji: '💇',
    universe: 'hair_salon',
    sortOrder: 100,
    searchTerms: ['air styler multifonction cheveux', 'appareil coiffant multifonction rotatif', 'seche cheveux professionnel ionique', 'seche cheveux moteur brushless', 'lisseur cheveux vapeur premium', 'lisseur titane professionnel', 'epilateur lumiere pulsee ipl', 'epilateur ipl corps visage', 'masque led visage photontherapie', 'appareil led visage rajeunissement', 'brosse soufflante volumatrice', 'brosse chauffante lissante', 'coiffeuse table maquillage led', 'miroir maquillage hollywood led', 'appareil soin visage ultrasonique', 'nettoyeur visage sonique', 'appareil radiofrequence visage', 'microcourant lifting visage', 'boucleur automatique cheveux', 'fer a boucler ceramique', 'tondeuse cheveux professionnelle', 'peigne demelant cheveux', 'pinceaux maquillage set', 'bigoudis chauffants rapides', 'ciseaux coiffure professionnel', 'cape coiffure salon'],
    keywords: ['cheveux', 'coiffure', 'coiffant', 'styler', 'seche-cheveux', 'seche cheveux', 'lisseur', 'boucleur', 'fer', 'brosse', 'soufflante', 'epilateur', 'ipl', 'lumiere pulsee', 'led', 'visage', 'masque', 'coiffeuse', 'miroir', 'maquillage', 'ultrasonique', 'sonique', 'radiofrequence', 'microcourant', 'lifting', 'tondeuse', 'peigne', 'pinceau', 'bigoudi', 'ciseaux', 'cape', 'appareil', 'nettoyeur', 'soin'],
  },
  {
    slug: 'barbier',
    nameFr: 'Barbier & rasage',
    emoji: '💈',
    universe: 'barber',
    sortOrder: 110,
    searchTerms: ['tondeuse barbe professionnelle', 'tondeuse barbe rechargeable', 'kit entretien barbe complet', 'rasoir de surete metal', 'ciseaux barbier professionnel', 'huile a barbe hydratante', 'blaireau rasage poils', 'tondeuse cheveux professionnelle', 'miroir barbier double face', 'peigne barbe bois', 'baume a barbe coiffant', 'tondeuse nez oreilles', 'serviette barbier chauffante', 'chauffe serviette barbier', 'rasoir electrique etanche', 'tete rasoir rotatif', 'pochette rangement barbier', 'tablier barbier impermeable', 'pinceau nettoyage tondeuse', 'shampoing barbe', 'brosse barbe sanglier', 'peigne poche metal', 'affuteur rasoir cuir', 'coffret rasage traditionnel'],
    keywords: ['barbe', 'rasage', 'rasoir', 'tondeuse', 'barbier', 'moustache', 'blaireau', 'peigne', 'huile', 'baume', 'ciseaux', 'miroir', 'serviette', 'pochette', 'tablier', 'pinceau', 'shampoing', 'brosse', 'affuteur', 'coffret', 'kit', 'tete'],
  },
  {
    slug: 'onglerie',
    nameFr: 'Onglerie',
    emoji: '💅',
    universe: 'nail_salon',
    sortOrder: 120,
    searchTerms: ['lampe uv led ongles', 'lampe seche ongles professionnelle', 'ponceuse ongles electrique', 'ponceuse ongles professionnelle', 'kit manucure professionnel complet', 'vernis semi permanent gel', 'faux ongles capsules', 'pinceaux nail art', 'strass decoration ongles', 'repose main manucure', 'aspirateur poussiere ongles', 'coupe ongles professionnel', 'base coat top coat', 'stickers ongles decoration', 'gel construction ongles', 'lime ongles electrique', 'poudre acrylique ongles', 'cuticule pousse bois', 'support ongles pratique', 'presentoir vernis rangement', 'kit pedicure professionnel', 'rape pieds electrique', 'sechoir ongles portable', 'pochoir nail art'],
    keywords: ['ongle', 'manucure', 'pedicure', 'vernis', 'nail', 'capsule', 'ponceuse', 'lampe', 'strass', 'coupe-ongles', 'cuticule', 'coat', 'sticker', 'gel', 'lime', 'poudre', 'acrylique', 'support', 'presentoir', 'rape', 'sechoir', 'pochoir', 'aspirateur', 'pinceau', 'repose main', 'kit'],
  },
  {
    slug: 'cils-sourcils',
    nameFr: 'Cils & sourcils',
    emoji: '👁️',
    universe: 'lash_studio',
    sortOrder: 130,
    searchTerms: ['extension de cils professionnel', 'kit extension cils volume russe', 'pince a cils courbe', 'kit rehaussement cils', 'teinture sourcils kit', 'colle extension cils', 'pincettes precision cils', 'serum croissance cils', 'pochoir sourcils forme', 'brosse sourcils double', 'lampe loupe estheticienne', 'patch hydrogel yeux', 'recourbe cils chauffant', 'ventilateur sechage cils', 'plateau colle cils', 'ruban microporeux cils', 'crayon sourcils precision', 'gel fixateur sourcils', 'faux cils magnetiques', 'eyeliner magnetique cils', 'miroir grossissant maquillage', 'ciseaux sourcils precision', 'peigne cils sourcils metal', 'tapis silicone cils'],
    keywords: ['cil', 'cils', 'sourcil', 'sourcils', 'extension', 'rehaussement', 'mascara', 'teinture', 'pince', 'pincette', 'pochoir', 'serum', 'hydrogel', 'lampe', 'loupe', 'recourbe', 'ventilateur', 'plateau', 'ruban', 'crayon', 'gel', 'magnetique', 'eyeliner', 'miroir', 'ciseaux', 'peigne', 'tapis', 'colle', 'brosse', 'patch', 'kit'],
  },
  {
    slug: 'tatouage-piercing',
    nameFr: 'Tatouage & piercing',
    emoji: '🪩',
    universe: 'tattoo',
    sortOrder: 140,
    searchTerms: ['bijou piercing titane', 'anneau septum acier chirurgical', 'piercing nombril acier', 'barbell langue titane', 'boucle oreille chirurgicale', 'creole acier inoxydable', 'ecarteur oreille bois', 'faux piercing sans trou', 'creme soin tatouage', 'baume apres tatouage', 'film protecteur tatouage', 'pansement tatouage transparent', 'tatouage temporaire adulte', 'tatouage temporaire realiste', 'pochoir tatouage temporaire', 'crayon transfert tatouage', 'gants nitrile noir', 'lampe loupe studio', 'repose bras tatouage', 'housse protection studio', 'nettoyant piercing solution', 'pince piercing acier', 'coffret piercing assorti', 'presentoir bijoux corps'],
    keywords: ['tatouage', 'tattoo', 'piercing', 'bijou', 'temporaire', 'septum', 'nombril', 'barbell', 'langue', 'boucle', 'creole', 'ecarteur', 'creme', 'baume', 'film', 'pansement', 'pochoir', 'crayon', 'nitrile', 'lampe', 'loupe', 'repose', 'housse', 'nettoyant', 'pince', 'coffret', 'presentoir', 'anneau', 'gant'],
  },
  {
    slug: 'fleuriste',
    nameFr: 'Fleurs & plantes',
    emoji: '💐',
    universe: 'florist',
    sortOrder: 150,
    searchTerms: ['kit plantation fleurs debutant', 'kit graines a planter', 'mini serre interieur', 'mini serre chauffante semis', 'jardiniere enfant kit', 'pots biodegradables semis', 'kit culture interieure led', 'kit fleurs sechees bouquet', 'bulbes a planter assortiment', 'kit plantes aromatiques cuisine', 'kit mini potager interieur', 'kit creation bouquet', 'kit decoration florale mariage', 'mousse florale piquage', 'ruban satin fleuriste', 'papier kraft bouquet', 'vase decoratif moderne', 'vase soliflore verre', 'secateur jardinage precision', 'ciseaux floraux fins', 'arrosoir decoratif interieur', 'brumisateur plantes', 'cache pot plante tresse', 'support plante interieur', 'fleurs artificielles decoration', 'guirlande fleurs artificielles', 'etiquettes semis jardin', 'tapis germination graines'],
    keywords: ['fleur', 'plante', 'vase', 'bouquet', 'jardinage', 'pot', 'floral', 'secateur', 'arrosoir', 'mousse', 'ruban', 'kraft', 'brumisateur', 'guirlande', 'ciseaux', 'support', 'cache pot', 'serre', 'graine', 'semis', 'bulbe', 'potager', 'aromatique', 'jardiniere', 'kit', 'etiquette', 'tapis', 'germination', 'culture', 'decoration'],
  },
  {
    slug: 'animalerie',
    nameFr: 'Animalerie',
    emoji: '🐾',
    universe: 'pet_store',
    sortOrder: 160,
    searchTerms: ['harnais chien promenade', 'laisse retractable chien', 'collier lumineux chien', 'gamelle chien inox', 'distributeur croquettes automatique', 'fontaine a eau animaux', 'arbre a chat design', 'griffoir chat carton', 'litiere chat automatique', 'pelle litiere chat', 'jouet chat interactif', 'jouet chien resistant', 'brosse poils animaux', 'gant brosse toilettage', 'coupe griffes animaux', 'tondeuse chien silencieuse', 'sac transport animal avion', 'caisse transport chien', 'coussin panier chien lavable', 'tapis rafraichissant chien', 'barriere securite animaux', 'tapis education chiot', 'sac ramasse crottes', 'distributeur friandises jouet', 'aquarium nano complet', 'cage rongeur equipee'],
    keywords: ['chien', 'chat', 'animal', 'animaux', 'harnais', 'laisse', 'gamelle', 'niche', 'griffoir', 'litiere', 'croquette', 'collier', 'panier', 'fontaine', 'arbre a chat', 'jouet', 'brosse', 'gant', 'coupe griffe', 'tondeuse', 'sac', 'caisse', 'coussin', 'tapis', 'barriere', 'friandise', 'aquarium', 'cage', 'rongeur', 'distributeur', 'pelle'],
  },
  {
    slug: 'cuisine',
    nameFr: 'Équipement cuisine',
    emoji: '🍳',
    universe: 'restaurant',
    sortOrder: 170,
    searchTerms: ['ustensiles cuisine silicone', 'couteau chef professionnel', 'set couteaux cuisine japonais', 'balance cuisine precision', 'organisateur cuisine rangement', 'mandoline legumes multifonction', 'planche a decouper bambou', 'robot petrin manuel', 'moule patisserie silicone', 'thermometre cuisine numerique', 'presse ail inox', 'essoreuse salade', 'boites conservation hermetiques', 'machine sous vide alimentaire', 'hachoir manuel legumes', 'rape multifonction inox', 'passoire pliable silicone', 'pichet doseur gradue', 'fouet inox professionnel', 'spatule silicone haute temperature', 'aiguiseur couteaux professionnel', 'egouttoir vaisselle inox', 'distributeur epices rotatif', 'tapis patisserie silicone', 'moulin poivre electrique', 'poele antiadhesive induction'],
    keywords: ['cuisine', 'ustensile', 'couteau', 'casserole', 'poele', 'culinaire', 'chef', 'planche', 'mandoline', 'moule', 'balance', 'thermometre', 'conservation', 'patisserie', 'robot', 'petrin', 'presse', 'essoreuse', 'machine', 'hachoir', 'rape', 'passoire', 'pichet', 'fouet', 'spatule', 'aiguiseur', 'egouttoir', 'distributeur', 'tapis', 'moulin', 'boite', 'set', 'organisateur'],
  },
  {
    slug: 'bricolage',
    nameFr: 'Bricolage & outils',
    emoji: '🔧',
    sortOrder: 180,
    searchTerms: ['set tournevis precision', 'tournevis electrique rechargeable', 'metre laser telemetre', 'niveau laser croix', 'perceuse sans fil professionnelle', 'visseuse a chocs sans fil', 'boite a outils complete', 'servante atelier rangement', 'pistolet a colle chaude', 'pince multiprise reglable', 'set pinces professionnelles', 'scie sauteuse electrique', 'scie circulaire portable', 'detecteur metaux mur', 'etabli pliant portable', 'etau etabli pivotant', 'visserie assortiment coffret', 'chevilles assortiment coffret', 'lunettes protection bricolage', 'casque antibruit chantier', 'multimetre numerique', 'fer a souder station', 'ponceuse excentrique electrique', 'meuleuse angulaire compacte', 'lampe atelier rechargeable', 'rangement mural outils'],
    keywords: ['outil', 'bricolage', 'tournevis', 'perceuse', 'visseuse', 'cle', 'atelier', 'scie', 'niveau', 'laser', 'etabli', 'pince', 'marteau', 'vis', 'colle', 'detecteur', 'protection', 'servante', 'etau', 'visserie', 'cheville', 'lunette', 'casque', 'multimetre', 'fer a souder', 'ponceuse', 'meuleuse', 'lampe', 'rangement', 'metre', 'set', 'boite', 'pistolet'],
  },
  {
    slug: 'photo-creation',
    nameFr: 'Photo & création',
    emoji: '📸',
    universe: 'photo_spot',
    sortOrder: 190,
    searchTerms: ['trepied smartphone photo', 'trepied appareil photo professionnel', 'ring light photo studio', 'panneau led video studio', 'stabilisateur gimbal smartphone', 'stabilisateur camera 3 axes', 'objectif clip smartphone', 'filtre objectif polarisant', 'fond studio photo tissu', 'support fond studio', 'micro cravate smartphone', 'micro canon camera', 'softbox eclairage studio', 'parapluie photo studio', 'teleprompteur smartphone', 'declencheur bluetooth photo', 'carte memoire haute vitesse', 'sac photo appareil rembourre', 'boite lumiere produit photo', 'table photo produit', 'reflecteur photo pliable', 'bras articule studio', 'fond vert chroma key', 'presentoir photo produit'],
    keywords: ['photo', 'trepied', 'ring light', 'gimbal', 'stabilisateur', 'objectif', 'studio', 'eclairage', 'micro', 'softbox', 'parapluie', 'filtre', 'carte memoire', 'declencheur', 'teleprompteur', 'fond', 'support', 'boite', 'table', 'reflecteur', 'bras', 'chroma', 'presentoir', 'sac', 'panneau', 'camera', 'video'],
  },
  {
    slug: 'cafe-the',
    nameFr: 'Café & thé',
    emoji: '☕',
    universe: 'cafe',
    sortOrder: 200,
    searchTerms: ['moulin a cafe manuel', 'moulin a cafe electrique', 'cafetiere italienne inox', 'presse francaise cafe', 'cafetiere filtre goutte', 'theiere en verre infuseur', 'mousseur a lait electrique', 'balance cafe precision', 'filtre cafe reutilisable', 'boite conservation cafe', 'infuseur the inox', 'tasses expresso set', 'tamper cafe professionnel', 'pichet lait barista', 'machine expresso portable', 'distributeur dosettes rangement', 'plateau service the', 'bouilloire col de cygne', 'thermometre lait barista', 'tapis barista silicone', 'set degustation the', 'porte capsules rotatif', 'mug isotherme cafe', 'carafe cafe filtre'],
    keywords: ['cafe', 'the', 'barista', 'cafetiere', 'theiere', 'moulin', 'expresso', 'infuseur', 'mousseur', 'filtre', 'tasse', 'tamper', 'pichet', 'machine', 'distributeur', 'plateau', 'bouilloire', 'thermometre', 'tapis', 'set', 'capsule', 'mug', 'carafe', 'balance', 'boite'],
  },
  {
    slug: 'meuble-deco',
    nameFr: 'Meuble & déco',
    emoji: '🛋️',
    sortOrder: 210,
    searchTerms: ['etagere murale bois design', 'etagere echelle decorative', 'meuble rangement modulable', 'commode tiroirs tissu', 'coussin decoratif salon', 'housse coussin lin', 'tapis salon moderne', 'tapis entree antiderapant', 'suspension luminaire design', 'lampe poser design salon', 'miroir decoratif mural', 'miroir sur pied plein', 'cadre photo mural set', 'porte photo mural design', 'plante artificielle decoration', 'panier osier rangement deco', 'rideau occultant chambre', 'voilage decoratif fenetre', 'organiseur rangement modulable', 'boite rangement decorative', 'table appoint pliante', 'table basse gigogne', 'guirlande led decoration interieure', 'applique murale led', 'porte manteau mural design', 'tete de lit decorative'],
    keywords: ['meuble', 'etagere', 'rangement', 'coussin', 'housse', 'tapis', 'luminaire', 'suspension', 'lampe', 'applique', 'miroir', 'cadre', 'photo', 'decoration', 'deco', 'decorative', 'rideau', 'voilage', 'table', 'guirlande', 'organiseur', 'boite', 'panier', 'plante', 'commode', 'tiroir', 'porte manteau', 'tete de lit', 'porte photo'],
  },
  {
    slug: 'auto-moto',
    nameFr: 'Auto & moto',
    emoji: '🚗',
    universe: 'garage',
    sortOrder: 220,
    searchTerms: ['organisateur coffre voiture', 'support telephone voiture magnetique', 'aspirateur voiture portable', 'camera de recul voiture', 'dashcam voiture full hd', 'compresseur pneu portable', 'chargeur allume cigare rapide', 'tapis de sol voiture', 'housse siege voiture universelle', 'pare soleil voiture pliable', 'nettoyant jantes auto', 'kit lavage voiture microfibre', 'alarme antivol voiture', 'demarreur batterie portable', 'manometre pression pneus', 'coffre de toit souple', 'housse moto impermeable', 'gants moto ete', 'antivol moto disque', 'sacoche reservoir moto', 'support telephone moto guidon', 'protection reservoir moto', 'kit reparation crevaison auto', 'organisateur siege arriere'],
    keywords: ['voiture', 'auto', 'moto', 'vehicule', 'coffre', 'pneu', 'allume-cigare', 'allume cigare', 'tapis de sol', 'housse', 'camera de recul', 'dashcam', 'jante', 'pare-soleil', 'pare soleil', 'casque', 'gant', 'alarme', 'antivol', 'demarreur', 'manometre', 'sacoche', 'support', 'nettoyant', 'kit', 'compresseur', 'aspirateur', 'organisateur', 'protection', 'reservoir', 'siege'],
  },
  {
    slug: 'velo-mobilite',
    nameFr: 'Vélo & mobilité',
    emoji: '🚴',
    sortOrder: 230,
    searchTerms: ['velo vtt 26 pouces adulte', 'velo vtt 27.5 pouces suspension', 'velo ville adulte 28 pouces', 'velo pliant adulte', 'velo enfant 20 pouces', 'velo ado 24 pouces', 'velo route aluminium', 'velo electrique pliant adulte', 'velo electrique ville batterie', 'vtt electrique adulte', 'trottinette electrique adulte', 'trottinette electrique pliable', 'trottinette enfant 3 roues', 'gyroroue electrique adulte', 'hoverboard tout terrain', 'skateboard electrique', 'draisienne enfant equilibre', 'tricycle enfant evolutif', 'antivol velo securite', 'casque velo adulte', 'sacoche velo etanche', 'eclairage velo led rechargeable', 'pompe velo portable', 'compteur velo sans fil', 'support telephone velo', 'selle velo confort gel', 'kit reparation crevaison velo', 'porte bagage velo'],
    keywords: ['velo', 'vtt', 'bicyclette', 'cycliste', 'cyclisme', 'trottinette', 'gyroroue', 'hoverboard', 'skateboard', 'draisienne', 'tricycle', 'electrique', 'antivol', 'sacoche', 'casque', 'pompe', 'compteur', 'selle', 'crevaison', 'bidon', 'eclairage', 'support', 'porte bagage', 'roue', 'batterie', 'pliant', 'pliable', 'adulte', 'enfant', 'pouce'],
  },
  {
    slug: 'soiree-karaoke',
    nameFr: 'Soirée & karaoké',
    emoji: '🎤',
    universe: 'karaoke',
    sortOrder: 240,
    searchTerms: ['micro karaoke bluetooth', 'micro sans fil karaoke duo', 'enceinte karaoke portable', 'enceinte lumineuse soiree', 'jeu de lumiere soiree', 'projecteur laser soiree', 'boule disco led rotative', 'barre led effet scene', 'machine a bulles fete', 'machine a fumee portable', 'guirlande led soiree', 'rideau lumineux led', 'ballons decoration fete', 'arche ballons anniversaire', 'photobooth accessoires set', 'cadre photobooth fete', 'confettis canon fete', 'bougies fontaine gateau', 'masque led fete', 'bracelets lumineux fete', 'table lumineuse led bar', 'verres led lumineux', 'banderole anniversaire personnalisable', 'ampoule led couleur telecommande'],
    keywords: ['karaoke', 'soiree', 'fete', 'micro', 'lumiere', 'disco', 'led', 'fumee', 'bulle', 'ballon', 'confetti', 'guirlande', 'photobooth', 'enceinte', 'laser', 'barre', 'rideau', 'arche', 'cadre', 'bougie', 'masque', 'bracelet', 'table', 'verre', 'banderole', 'ampoule', 'projecteur', 'machine', 'jeu'],
  },
  {
    slug: 'lecture',
    nameFr: 'Lecture & écriture',
    emoji: '📚',
    universe: 'bookstore',
    sortOrder: 250,
    searchTerms: ['liseuse housse protection', 'support liseuse lit', 'lampe de lecture rechargeable', 'lampe clip livre led', 'support livre lecture reglable', 'coussin lecture lit ergonomique', 'marque page magnetique set', 'marque page metal design', 'serre livres decoratifs', 'etagere murale livres', 'carnet cuir notes', 'carnet pointille bullet journal', 'stylo plume calligraphie', 'set calligraphie debutant', 'stylo roller encre noire', 'encre calligraphie flacon', 'kit lettering brush pen', 'feutres coloriage adulte', 'tampons scrapbooking papeterie', 'washi tape decoratif', 'loupe lecture eclairee', 'plaid lecture polaire', 'casque audio confort lecture', 'coffret cadeau lecture the', 'boite rangement papeterie', 'trousse crayons cuir'],
    keywords: ['livre', 'lecture', 'liseuse', 'marque-page', 'marque page', 'lampe', 'carnet', 'stylo', 'plume', 'roller', 'encre', 'calligraphie', 'lettering', 'feutre', 'tampon', 'washi', 'loupe', 'plaid', 'casque', 'coffret', 'papeterie', 'boite', 'trousse', 'serre-livres', 'serre livres', 'etagere', 'support', 'coussin', 'kit', 'set'],
  },
  {
    slug: 'bijoux-montres',
    nameFr: 'Bijoux & montres',
    emoji: '💍',
    universe: 'jewelry',
    sortOrder: 260,
    searchTerms: ['collier acier inoxydable femme', 'collier homme chaine acier', 'bracelet cuir homme tresse', 'bracelet jonc femme acier', 'montre automatique homme squelette', 'montre femme bracelet maille', 'montre homme chronographe acier', 'montre minimaliste unisexe', 'boucles oreilles argent 925', 'creoles acier dorees', 'bague acier femme reglable', 'chevaliere homme acier', 'chaine cheville femme', 'pendentif argent 925', 'bracelet perles pierre naturelle', 'collier pierre naturelle', 'broche vintage elegante', 'parure bijoux mariage', 'coffret rangement bijoux', 'boite montre rangement', 'remontoir montre automatique', 'outil reglage bracelet montre', 'presentoir bijoux comptoir', 'pochette voyage bijoux'],
    keywords: ['bijou', 'collier', 'bracelet', 'bague', 'montre', 'pendentif', 'chaine', 'boucle', 'argent', 'acier', 'perle', 'broche', 'cheville', 'coffret', 'boucle d oreille', 'creole', 'chevaliere', 'parure', 'pierre', 'remontoir', 'outil', 'presentoir', 'pochette', 'boite', 'jonc'],
  },
  {
    slug: 'jouets-cadeaux',
    nameFr: 'Jouets & cadeaux',
    emoji: '🎁',
    sortOrder: 280,
    searchTerms: ['briques construction compatibles', 'blocs construction enfant creatif', 'maquette construction bois', 'circuit voitures enfant', 'voiture telecommandee tout terrain', 'voiture telecommandee cascade', 'camion telecommande chantier', 'robot telecommande enfant', 'cartes a collectionner classeur', 'classeur rangement cartes', 'protege cartes pochettes', 'jeu de cartes famille', 'jeu de societe famille', 'jeu societe strategie plateau', 'puzzle 1000 pieces adulte', 'puzzle 3d maquette', 'peluche geante douce', 'peluche animal realiste', 'doudou bebe naissance', 'poupee chiffon tissu', 'jouet montessori bois', 'kit science enfant experience', 'jeu construction magnetique', 'tableau magnetique enfant', 'veilleuse enfant projection', 'coffret cadeau naissance', 'jouet interactif bebe eveil', 'tapis eveil bebe', 'accessoires gaming enfant', 'manette retro gaming', 'velo enfant 12 pouces roulettes', 'velo enfant 16 pouces', 'porteur bebe voiture', 'trotteur porteur enfant', 'voiture electrique enfant telecommande', 'quad electrique enfant', 'moto electrique enfant', 'kart a pedales enfant', 'draisienne bois bebe', 'casque enfant velo trottinette'],
    keywords: ['jouet', 'jeu', 'peluche', 'puzzle', 'poupee', 'montessori', 'construction', 'brique', 'bloc', 'circuit', 'voiture', 'telecommande', 'camion', 'robot', 'carte', 'classeur', 'pochette', 'maquette', 'doudou', 'veilleuse', 'coffret', 'cadeau', 'naissance', 'interactif', 'eveil', 'tapis', 'magnetique', 'tableau', 'science', 'gaming', 'manette', 'figurine', 'enfant', 'bebe', 'velo', 'porteur', 'trotteur', 'quad', 'moto', 'kart', 'draisienne', 'roulette', 'pedale', 'electrique', 'casque', 'pouce'],
  },
  {
    slug: 'bureau-teletravail',
    nameFr: 'Multimédia',
    emoji: '📺',
    universe: 'coworking',
    sortOrder: 290,
    searchTerms: ['televiseur led 32 pouces', 'smart tv 43 pouces', 'support tv mural orientable', 'barre de son tv bluetooth', 'console retro jeux integres', 'console portable retro', 'manette console sans fil', 'volant gaming pc console', 'mini pc bureau windows', 'ordinateur portable etudiant', 'clavier souris sans fil', 'ecran pc 24 pouces', 'ecran gaming 144hz', 'support ecran double bras', 'tablette android 10 pouces', 'tablette dessin graphique', 'smartphone android debloque', 'coque protection smartphone', 'videoprojecteur home cinema', 'ecran projection motorise', 'chaine hifi bluetooth', 'amplificateur audio hifi', 'enceinte colonne salon', 'casque realite virtuelle vr', 'imprimante 3d debutant', 'filament impression 3d', 'clavier piano numerique', 'pad batterie electronique', 'autoradio bluetooth ecran', 'camera embarquee voiture'],
    keywords: ['televiseur', 'tv', 'smart tv', 'console', 'manette', 'volant', 'pc', 'ordinateur', 'clavier', 'souris', 'ecran', 'moniteur', 'tablette', 'smartphone', 'telephone', 'coque', 'videoprojecteur', 'projection', 'projecteur', 'hifi', 'amplificateur', 'enceinte', 'casque', 'realite virtuelle', 'imprimante 3d', 'filament', 'piano', 'batterie', 'autoradio', 'camera', 'support', 'barre de son', 'gaming', 'audio'],
  },
  {
    slug: 'loisirs-creatifs',
    nameFr: 'Loisirs créatifs',
    emoji: '🎨',
    sortOrder: 300,
    searchTerms: ['toile vierge chassis 20x20', 'toile vierge chassis 30x30', 'toile vierge chassis 40x50', 'toile peinture 50x70', 'lot petites toiles peinture', 'toile ronde peinture', 'toile coeur peinture', 'toile noire acrylique', 'toiles pastel colorees', 'panneau bois vierge peindre', 'coffret chevalet toiles', 'chevalet table peinture', 'carnet dessin sketchbook', 'bloc aquarelle papier', 'papier acrylique special', 'papier dessin grain', 'miroir a decorer diy', 'tote bag vierge personnaliser', 'pochoir peinture reutilisable', 'peinture acrylique set', 'pinceaux peinture acrylique', 'set aquarelle professionnel', 'marqueurs alcool dessin', 'crayons couleur professionnels', 'peinture par numero adulte', 'diamond painting kit', 'argile polymere modelage', 'kit crochet debutant', 'perles rocaille bijoux', 'tampons encreurs scrapbooking'],
    keywords: ['toile', 'chassis', 'peinture', 'peindre', 'panneau', 'chevalet', 'carnet', 'sketchbook', 'dessin', 'croquis', 'bloc', 'aquarelle', 'papier', 'miroir', 'tote bag', 'pochoir', 'pinceau', 'marqueur', 'crayon', 'acrylique', 'numero', 'diamond', 'argile', 'modelage', 'crochet', 'tricot', 'perle', 'tampon', 'scrapbooking', 'creatif', 'kit', 'coffret', 'set', 'lot'],
  },
  {
    slug: 'spa-massage',
    nameFr: 'Spa & massage',
    emoji: '💆',
    universe: 'spa',
    sortOrder: 310,
    searchTerms: ['appareil massage nuque epaules', 'coussin massant shiatsu chauffant', 'pistolet massage percussion pro', 'appareil massage pieds electrique', 'bain de pieds massant chauffant', 'machine massage jambes compression', 'ceinture massage abdominale electrique', 'appareil massage dos chaise', 'fauteuil massage portable pliable', 'matelas massant chauffant', 'appareil massage cervical traction', 'rouleau massage electrique vibrant', 'sauna facial vapeur visage', 'hammam facial appareil', 'appareil sauna infrarouge portable', 'couverture chauffante infrarouge', 'diffuseur huiles essentielles spa', 'humidificateur brumisateur ambiance', 'pierres chaudes massage kit', 'bougie massage parfumee', 'huile de massage relaxante', 'table massage pliante portable', 'ventouse massage silicone', 'gua sha pierre visage', 'peignoir microfibre spa', 'sels de bain relaxants'],
    keywords: ['massage', 'massant', 'appareil', 'machine', 'pistolet', 'coussin', 'fauteuil', 'matelas', 'rouleau', 'ceinture', 'sauna', 'hammam', 'vapeur', 'infrarouge', 'couverture', 'diffuseur', 'humidificateur', 'brumisateur', 'pierre', 'bougie', 'huile', 'table', 'ventouse', 'gua sha', 'peignoir', 'sel', 'bain', 'spa', 'relaxation', 'nuque', 'cervical', 'pied'],
  },
  {
    slug: 'cinema-maison',
    nameFr: 'Soirée cinéma',
    emoji: '🍿',
    universe: 'cinema',
    sortOrder: 320,
    searchTerms: ['mini projecteur portable', 'videoprojecteur full hd maison', 'ecran de projection pliable', 'ecran projection trepied', 'machine a popcorn maison', 'machine barbe a papa', 'barre de son tv', 'enceinte home cinema 5.1', 'support tablette lit reglable', 'support telephone canape', 'lampe led ambiance tv', 'bandeau led retroeclairage tv', 'plaid canape polaire', 'plaid chauffant electrique', 'coussin de sol cinema', 'pouf geant salon', 'telecommande universelle tv', 'boitier android tv', 'lunettes anti lumiere bleue', 'casque tv sans fil', 'guirlande led salon', 'projecteur etoiles galaxie', 'boite rangement telecommande', 'plateau canape repas'],
    keywords: ['projecteur', 'videoprojecteur', 'projection', 'ecran', 'popcorn', 'barbe a papa', 'son', 'enceinte', 'home cinema', 'support', 'tablette', 'lampe', 'bandeau', 'plaid', 'coussin', 'pouf', 'telecommande', 'boitier', 'lunette', 'casque', 'cinema', 'guirlande', 'etoile', 'galaxie', 'boite', 'plateau', 'canape', 'led', 'machine', 'tv'],
  },
  {
    slug: 'cake-design',
    nameFr: 'Pâtisserie & cake design',
    emoji: '🧁',
    universe: 'bakery',
    sortOrder: 330,
    searchTerms: ['moule silicone patisserie', 'moule gateau anniversaire', 'poche a douille set', 'douilles inox patisserie', 'colorant alimentaire gel', 'colorant poudre alimentaire', 'tapis silicone patisserie', 'tapis mesure patisserie', 'emporte piece patisserie', 'emporte piece biscuits set', 'plateau tournant gateau', 'plateau presentation gateau', 'spatule lissante gateau', 'lisseur pate a sucre', 'thermometre sucre cuisson', 'thermometre four numerique', 'caissettes cupcake papier', 'support cupcakes presentoir', 'decoration comestible gateau', 'perles sucre decoration', 'rouleau texture pate a sucre', 'rouleau patisserie ajustable', 'boite transport gateau', 'carton support gateau', 'pistolet decoration gateau', 'set modelage pate a sucre', 'tapis dentelle sucre', 'pochoir decoration gateau'],
    keywords: ['patisserie', 'gateau', 'moule', 'douille', 'poche', 'colorant', 'tapis', 'emporte', 'plateau', 'spatule', 'lisseur', 'thermometre', 'caissette', 'cupcake', 'decoration', 'pate a sucre', 'rouleau', 'boite', 'silicone', 'cuisson', 'presentoir', 'perle', 'carton', 'pistolet', 'modelage', 'dentelle', 'pochoir', 'support', 'set'],
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
