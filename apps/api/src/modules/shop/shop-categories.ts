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
   * Mot que le titre doit AUSSI contenir, en plus d'un `keywords`.
   *
   * `keywords` est une liste OU : un seul mot un peu large suffit à faire
   * entrer n'importe quoi. « rangement » a ramené des organisateurs de coffre
   * de voiture dans le rayon bébé, « couche » des couches pour chien,
   * « chambre » une robe de chambre pour femme. Exiger en plus un mot de
   * contexte tranche ces cas sans avoir à deviner un par un les objets du
   * monde qui se rangent.
   *
   * Absent = pas de seconde condition, le rayon se contente de `keywords`.
   */
  requireContext?: string[];
  /**
   * Mot qui disqualifie le titre, quoi qu'il contienne par ailleurs.
   *
   * Contrairement à `keywords`, dont l'absence se constate, ceci se vérifie :
   * pour un rayon dont certains articles sont interdits de principe, ne pas
   * les nommer ne suffit pas — il faut les refuser.
   */
  exclude?: string[];
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
    // Second audit : des étagères et meubles à chaussures.
    exclude: ['etagere a chaussures', 'meuble a chaussures', 'balcon'],
    searchTerms: [
      // -- Termes d'origine --
      'organisateur valise voyage', 'trousse de toilette voyage', 'adaptateur prise universel', 'oreiller de voyage', 'cadenas TSA bagage', 'balance bagage electronique', 'sac de compression voyage', 'pochette passeport rfid', 'masque de sommeil voyage', 'etiquette bagage', 'flacons voyage silicone', 'sac week end cabine', 'valise cabine rigide', 'housse de valise protection', 'sangle valise securite', 'trousse cables voyage', 'coussin repose pieds avion', 'sac a dos antivol voyage', 'pochette ceinture voyage', 'kit voyage avion confort', 'chaussons voyage compressibles', 'organisateur chaussures valise', 'porte documents voyage', 'sac pliable supplementaire',
      // -- Ajout 21/09 : valises/sacs grande capacite, confort corporel, anti-vol vestimentaire, electronique, hygiene, souvenirs, accessoires voiture --
      'valise grande capacite pliable', 'sac de voyage etanche grande capacite', 'sac a dos de voyage 40l', 'sac a dos etanche voyage', 'housse de protection ordinateur voyage', 'sacoche ordinateur portable voyage', 'trousse electronique voyage rangement', 'hamac repose jambes avion', 'appui tete cervical gonflable voyage', 'coussin cervical gonflable avion', 'couverture de voyage compacte pliable', 'oreiller de cou memoire de forme voyage', 'chale multifonction voyage poche', 'echarpe voyage poche secrete anti vol', 'gilet multipoche voyage', 'portefeuille voyage anti rfid multipoche', 'sac banane voyage antivol', 'multiprise usb voyage compacte', 'chargeur voiture multiport voyage', 'batterie externe voyage compacte', 'lampe de poche voyage compacte', 'reveil de voyage compact silencieux', 'adaptateur multiprise international voyage', 'distributeur de savon portable voyage', 'brosse a dents pliable voyage', 'lingettes reutilisables voyage', 'carnet de voyage journal', 'carte du monde a gratter', 'tampon passeport decoratif', 'kit de couture voyage', 'gants de voyage tactiles', 'parapluie pliable compact voyage', 'housse anti pluie sac a dos voyage', 'organisateur voiture voyage', 'support telephone voiture voyage', 'sac de sport voyage compressible', 'gourde pliable voyage', 'housse de protection roulettes valise', 'sac a linge sale voyage', 'pochette rangement chaussures voyage', 'sac de rangement cosmetique voyage', 'housse vetements suspendue voyage', 'boussole compacte voyage', 'sac isotherme voyage compact',
    ],
    keywords: ['voyage', 'valise', 'bagage', 'trolley', 'passeport', 'cabine', 'oreiller', 'adaptateur', 'trousse', 'organisateur', 'cadenas', 'serrure', 'balance', 'housse', 'sangle', 'pochette', 'coussin', 'sac', 'etiquette', 'chausson', 'document', 'flacon', 'masque', 'kit', 'hamac', 'chale', 'echarpe', 'gilet', 'portefeuille', 'multiprise', 'chargeur', 'batterie', 'lampe', 'reveil', 'lingette', 'savon', 'brosse a dents', 'carnet', 'carte du monde', 'tampon passeport', 'couture', 'boussole', 'parapluie', 'gourde', 'support telephone', 'gant tactile'],
  },
  {
    slug: 'gadgets-tech',
    nameFr: 'Gadgets & électronique',
    emoji: '🎧',
    sortOrder: 20,
    searchTerms: ['ecouteurs bluetooth reduction bruit', 'ecouteurs sans fil sport', 'mini videoprojecteur portable', 'enceinte bluetooth design', 'enceinte bluetooth waterproof', 'montre connectee sport', 'bracelet connecte fitness', 'lunettes connectees audio', 'appareil photo instantane', 'manette gaming sans fil', 'casque gaming filaire', 'tapis souris xxl gaming', 'microphone podcast usb', 'micro cravate sans fil', 'bandeau led ambiance tv', 'lampe led ambiance rgb', 'drone camera pliable', 'mini drone debutant', 'platine vinyle bluetooth', 'liseuse ecran encre', 'webcam full hd', 'camera sport etanche', 'station recharge multifonction', 'batterie externe usb c', 'chargeur sans fil rapide', 'hub usb c multiport', 'lampe torche rechargeable', 'traceur gps objet',
      // -- Ajout 22/09 : familles absentes du rayon --
      'ampoule connectee couleur wifi', 'prise connectee mesure consommation', 'ruban led connecte rgb', 'detecteur mouvement wifi maison', 'sonnette video sans fil', 'serrure connectee empreinte', 'thermostat connecte radiateur', 'capteur temperature humidite connecte', 'reveil projection heure plafond', 'radio reveil bluetooth', 'chargeur voiture usb c rapide', 'support telephone voiture magnetique', 'transmetteur fm bluetooth voiture', 'aspirateur voiture sans fil', 'camera de recul sans fil', 'powerbank 20000mah charge rapide', 'chargeur solaire portable usb', 'multiprise usb bureau parasurtenseur', 'organiseur cables bureau', 'sacoche rangement accessoires tech', 'cable usb c tresse lot', 'adaptateur usb c jack audio', 'lecteur mp3 sport bluetooth', 'radio dab portable rechargeable', 'tourne disque valise portable', 'imprimante photo portable bluetooth', 'scanner portable document', 'stylo scanner traducteur', 'cadre photo numerique wifi', 'videoprojecteur laser portable',
    ],
    keywords: ['ecouteur', 'casque', 'enceinte', 'videoprojecteur', 'projecteur', 'montre', 'bracelet', 'lunette', 'appareil photo', 'manette', 'gaming', 'tapis', 'microphone', 'micro', 'led', 'ambiance', 'drone', 'platine', 'vinyle', 'liseuse', 'webcam', 'camera', 'station', 'recharge', 'batterie', 'chargeur', 'hub', 'usb', 'torche', 'traceur', 'gps', 'bluetooth', 'connectee', 'connecte', 'prise', 'detecteur', 'mouvement', 'sonnette', 'serrure', 'empreinte', 'thermostat', 'capteur', 'reveil', 'projection', 'radio', 'transmetteur', 'aspirateur', 'recul', 'powerbank', 'multiprise', 'parasurtenseur', 'jack', 'mp3', 'dab', 'tourne disque', 'imprimante', 'scanner', 'traducteur', 'numerique', 'wifi', 'rgb', 'support telephone', 'organiseur cables', 'sacoche rangement'],
  },
  {
    slug: 'plage-vacances',
    nameFr: 'Plage & vacances',
    emoji: '🏖️',
    universe: 'beach',
    sortOrder: 30,
    // Refusés ici : le premier audit y a trouvé des lingettes de salle de bain, entrées par « serviette ».
    // Second audit : des tapis de bateau, de tableau de bord et un repose-poignet de bureau.
    exclude: ['salle de bain', 'lingette', 'bateau', 'tableau de bord', 'passerelle', 'repose-poignet'],
    searchTerms: ['serviette plage microfibre', 'sac etanche plage', 'parasol portable plage', 'matelas gonflable plage', 'chapeau paille plage', 'tapis de plage antisable', 'jeu raquettes plage', 'douche solaire portable', 'sandales plage antiderapantes', 'pochette telephone etanche', 'glaciere souple plage', 'hamac portable', 'tente de plage anti uv', 'bouee gonflable geante', 'ballon plage gonflable', 'sac filet plage', 'brumisateur portable rechargeable', 'ventilateur portable rechargeable', 'lunettes soleil polarisees', 'paravent plage pliable', 'coffre rangement plage', 'poncho serviette surf', 'jeux sable enfant', 'support parasol sable',
      // -- Ajout 22/09 : familles absentes du rayon --
      'transat pliable plage', 'fauteuil bas plage pliant', 'oreiller gonflable plage', 'voile d ombrage exterieur', 'brosse anti sable plage', 'sac maillot mouille impermeable', 'etendoir portable serviettes', 'bodyboard planche plage', 'leash planche surf', 'wax surf antiderapant', 'palmes courtes bodyboard', 'cerf volant plage enfant', 'frisbee plage souple', 'jeu de palets plage', 'molkky jeu exterieur bois', 'filet volley plage portable', 'support telephone plage', 'etui appareil photo etanche', 'gourde isotherme grande capacite', 'seau chateau sable enfant', 'pelle rateau sable enfant', 'moule chateau de sable', 'tapis gonflable flottant', 'gilet anti uv enfant plage', 'chapeau bob anti uv enfant', 'lunettes soleil enfant plage', 'sac plage xxl paille', 'coffre fort plage portable', 'brumisateur ventilateur main',
    ],
    keywords: ['plage', 'mer', 'sable', 'balneaire', 'serviette', 'parasol', 'etanche', 'maillot', 'bouee', 'hamac', 'solaire', 'sandale', 'chapeau', 'tente', 'ballon', 'filet', 'brumisateur', 'ventilateur', 'lunette', 'paravent', 'coffre', 'poncho', 'jeu', 'tapis', 'glaciere', 'douche', 'matelas', 'pochette', 'support', 'transat', 'voile d ombrage', 'etendoir', 'bodyboard', 'leash', 'wax', 'cerf volant', 'frisbee', 'palet', 'molkky', 'volley', 'gourde', 'rateau', 'anti uv', 'bob', 'coffre fort', 'surf', 'palme'],
  },
  {
    slug: 'randonnee',
    nameFr: 'Randonnée & trek',
    emoji: '🥾',
    universe: 'hiking',
    sortOrder: 40,
    // Second audit : des filtres de machine à laver et de tuyau d'arrosage.
    exclude: ['machine a laver', 'tuyau d arrosage'],
    searchTerms: ['sac a dos randonnee', 'batons de randonnee', 'gourde filtrante randonnee', 'lampe frontale randonnee', 'chaussettes randonnee', 'poncho pluie randonnee', 'boussole orientation', 'trousse premiers secours randonnee', 'couverture de survie', 'guetres randonnee', 'sac hydratation', 'couteau multifonction randonnee', 'sifflet survie multifonction', 'pierre a feu allumage', 'filtre a eau portable', 'pochette etanche telechargement', 'genouillere randonnee', 'bache abri leger', 'corde paracorde survie', 'trepied bivouac', 'sac de couchage compact', 'matelas gonflable trek', 'housse pluie sac a dos', 'crampons neige chaussures',
      // -- Ajout 22/09 : familles absentes du rayon --
      'jumelles randonnee compactes', 'batterie externe solaire randonnee', 'panneau solaire pliable trek', 'montre altimetre randonnee', 'porte carte randonnee etanche', 'buff tour de cou randonnee', 'casquette saharienne randonnee', 'manchettes protection uv sport', 'semelles amortissantes randonnee', 'protege ampoules pieds', 'moustiquaire tete randonnee', 'bracelet reflechissant securite', 'sac de compression vetements', 'organiseur sac a dos pochettes', 'kit reparation materiel outdoor', 'ruban adhesif tissu reparation', 'embouts batons randonnee rechange', 'rondelles batons randonnee', 'tapis assise pliable randonnee', 'rechaud ultraleger trek', 'popote titane ultralegere', 'gobelet pliable randonnee', 'housse chaussures randonnee', 'lacets chaussures randonnee rechange', 'chaufferette main randonnee', 'serviette microfibre trek', 'sac a dos enfant randonnee', 'sifflet boussole multifonction', 'miroir de signalisation survie',
    ],
    keywords: ['randonnee', 'trekking', 'montagne', 'sac a dos', 'baton', 'gourde', 'frontale', 'boussole', 'survie', 'poncho', 'chaussette', 'couteau', 'secours', 'hydratation', 'sifflet', 'feu', 'filtre', 'pochette', 'genouillere', 'bache', 'corde', 'paracorde', 'trepied', 'couchage', 'matelas', 'housse', 'crampon', 'sac', 'jumelles', 'batterie', 'panneau solaire', 'montre', 'altimetre', 'porte carte', 'buff', 'casquette', 'manchette', 'semelle', 'moustiquaire', 'bracelet', 'reflechissant', 'compression', 'reparation', 'embout', 'rondelle', 'rechaud', 'popote', 'lacet', 'chaufferette', 'titane', 'microfibre', 'protege ampoules'],
  },
  {
    slug: 'camping',
    nameFr: 'Camping & glamping',
    emoji: '⛺',
    universe: 'camping',
    sortOrder: 50,
    // Second audit : des tapis de sol de voiture et un cintre de placard.
    exclude: ['tesla', 'range rover', 'tapis de sol de voiture', 'placard'],
    searchTerms: ['tente camping 2 places', 'tente camping familiale', 'sac de couchage camping', 'rechaud camping gaz', 'lanterne camping led', 'matelas autogonflant camping', 'chaise pliante camping', 'table pliante camping', 'popote camping inox', 'hamac suspendu camping', 'bache tarp camping', 'glaciere electrique camping', 'allume feu camping', 'douche solaire camping', 'toilette portable camping', 'guirlande led camping', 'panneau solaire portable camping', 'ventilateur camping rechargeable', 'marteau sardines tente', 'tapis de sol tente', 'four camping portable', 'cafetiere camping outdoor', 'rangement suspendu tente', 'couverture picnic impermeable',
      // -- Ajout 22/09 : familles absentes du rayon --
      'lit de camp pliant', 'oreiller gonflable camping', 'drap de sac de couchage', 'auvent tente camping', 'moustiquaire tente rechange', 'kit reparation toile tente', 'lampe tempete camping', 'projecteur led camping rechargeable', 'station electrique portable camping', 'rallonge electrique exterieur', 'bidon eau robinet camping', 'jerrican eau pliable', 'vaisselle reutilisable camping', 'egouttoir vaisselle camping', 'bassine pliable camping', 'caisse rangement camping', 'cabine douche pop up', 'brasero portable exterieur', 'grille barbecue portable camping', 'pince barbecue camping', 'filtre eau gravite camping', 'matelas coffre voiture camping', 'moustiquaire fenetre voiture', 'tapis exterieur tente auvent', 'sardines tente renforcees', 'tendeur elastique tente', 'sac de rangement tente', 'chaise enfant camping', 'jeu exterieur camping famille', 'douchette rechargeable camping',
    ],
    keywords: ['camping', 'tente', 'bivouac', 'couchage', 'rechaud', 'lanterne', 'matelas', 'hamac', 'popote', 'glaciere', 'tarp', 'chaise', 'table', 'douche', 'toilette', 'guirlande', 'panneau solaire', 'ventilateur', 'sardine', 'tapis', 'four', 'cafetiere', 'rangement', 'couverture', 'feu', 'bache', 'marteau', 'lit', 'drap', 'auvent', 'moustiquaire', 'reparation', 'tempete', 'bidon', 'jerrican', 'vaisselle', 'egouttoir', 'bassine', 'caisse', 'cabine', 'brasero', 'tendeur', 'douchette', 'barbecue', 'fenetre', 'rallonge electrique'],
  },
  {
    slug: 'pique-nique',
    nameFr: 'Pique-nique',
    emoji: '🧺',
    universe: 'picnic_area',
    sortOrder: 60,
    // Refusés ici : le premier audit y a trouvé une planche à pendule d'autel wicca, entrée par « planche ».
    // Second audit : six coussins de siège de voiture et de moto.
    exclude: ['wicca', 'autel', 'pendule', 'metaphysique', 'coussin de siege'],
    searchTerms: ['panier pique nique', 'glaciere isotherme', 'nappe pique nique impermeable', 'couverts reutilisables pique nique', 'plaid pique nique impermeable', 'boite repas compartiment', 'sac isotherme dejeuner', 'planche apero bois', 'gourde isotherme', 'moulin poivre sel voyage', 'verres incassables plein air', 'tire bouchon pique nique', 'lunch box chauffante', 'set couteaux picnic', 'pack froid reutilisable', 'distributeur boisson picnic', 'table pliante picnic', 'coussin assise exterieur', 'sac a dos picnic equipe', 'boite salade nomade', 'thermos alimentaire soupe', 'serviettes tissu picnic', 'parasol table exterieur', 'panier osier rangement',
      // -- Ajout 22/09 : familles absentes du rayon --
      'chariot pliable transport courses', 'cloche anti mouches alimentaire', 'bougie citronnelle exterieur', 'bee wrap emballage reutilisable', 'sac reutilisable conservation aliments', 'boite hermetique verre repas', 'saladier couvercle transport', 'plateau service exterieur', 'carafe isotherme boisson', 'seau a glace pliable', 'pailles inox reutilisables', 'couverts bambou set nomade', 'assiettes reutilisables melamine', 'gobelets reutilisables lot', 'porte bouteille isotherme', 'rafraichisseur bouteille vin', 'ouvre boite nomade', 'planche decouper pliable', 'sac a pain tissu', 'boite oeufs transport', 'chaise basse pliable exterieur', 'coussin pliable assise nomade', 'nappe lestee anti vent', 'pinces nappe exterieur', 'lanterne solaire table exterieur', 'sac isotherme enfant gouter', 'boite gouter enfant compartiment', 'gourde enfant paille', 'lingettes lavables repas', 'range couverts transport',
    ],
    keywords: ['pique-nique', 'pique nique', 'picnic', 'panier', 'glaciere', 'isotherme', 'nappe', 'plaid', 'couvert', 'gourde', 'apero', 'planche', 'boite repas', 'lunch', 'thermos', 'moulin', 'verre', 'tire bouchon', 'pack froid', 'distributeur', 'table', 'coussin', 'sac', 'boite', 'serviette', 'parasol', 'osier', 'couteau', 'cloche', 'citronnelle', 'bee wrap', 'emballage', 'hermetique', 'saladier', 'carafe', 'paille', 'porte bouteille', 'rafraichisseur', 'ouvre boite', 'sac a pain', 'lestee', 'gouter', 'range couverts', 'reutilisable', 'chariot pliable', 'plateau service', 'seau a glace', 'chaise basse', 'lingettes lavables'],
  },
  {
    slug: 'piscine-aquatique',
    nameFr: 'Piscine & aquatique',
    emoji: '🏊',
    universe: 'aquatic',
    sortOrder: 70,
    searchTerms: ['masque snorkeling', 'lunettes natation adulte', 'bouee gonflable piscine', 'sac etanche natation', 'palmes natation', 'bonnet de bain silicone', 'planche natation', 'thermometre piscine', 'epuisette piscine', 'jouets plongee piscine', 'peignoir microfibre', 'brassards enfant piscine', 'matelas gonflable piscine', 'fauteuil gonflable piscine', 'robot nettoyeur piscine', 'aspirateur piscine manuel', 'bache solaire piscine', 'echelle piscine hors sol', 'pistolet a eau enfant', 'tapis flottant piscine', 'chaussons aquatiques antiderapants', 'ceinture flottaison natation', 'pince nez natation', 'sac filet jouets piscine',
      // -- Ajout 22/09 : familles absentes du rayon --
      'pull buoy natation entrainement', 'plaquettes natation mains', 'tuba frontal natation', 'elastique natation entrainement', 'haltere aquagym mousse', 'frite piscine mousse', 'gant palme aquagym', 'maillot flotteur apprentissage enfant', 'siege bebe gonflable piscine', 'testeur ph electronique piscine', 'bandelettes test eau piscine', 'cartouche filtre piscine', 'skimmer flottant piscine', 'tuyau piscine raccord', 'pompe filtration piscine hors sol', 'tapis solaire chauffage piscine', 'bache hivernage piscine', 'flotteur hivernage piscine', 'brosse ligne d eau piscine', 'balai aspirateur piscine manche', 'panier rangement jouets piscine', 'porte serviette piscine', 'lunettes natation enfant', 'masque integral snorkeling', 'chaussons neoprene aquatique', 'bonnet bain enfant silicone', 'sac filet sechage maillot', 'douche exterieure piscine', 'tapis antiderapant bord piscine', 'lumiere led flottante piscine',
    ],
    keywords: ['piscine', 'natation', 'snorkeling', 'plongee', 'aquatique', 'bouee', 'palme', 'lunette', 'bonnet', 'maillot', 'peignoir', 'brassard', 'epuisette', 'matelas', 'fauteuil', 'robot', 'aspirateur', 'bache', 'echelle', 'pistolet', 'tapis', 'chausson', 'ceinture', 'pince', 'filet', 'jouet', 'planche', 'thermometre', 'sac', 'pull buoy', 'plaquette', 'tuba', 'haltere', 'frite', 'flotteur', 'testeur', 'bandelette', 'cartouche', 'skimmer', 'tuyau', 'filtration', 'hivernage', 'balai', 'porte serviette', 'neoprene', 'bebe', 'aquagym'],
  },
  {
    slug: 'sport',
    nameFr: 'Équipement sportif',
    emoji: '🏋️',
    universe: 'sporting_goods',
    sortOrder: 80,
    // Second audit : une poignée de moto et un tapis de tableau de bord.
    exclude: ['poignee de moto', 'tableau de bord'],
    searchTerms: ['halteres reglables musculation', 'banc de musculation pliable', 'power tower station musculation', 'set halteres poids fonte', 'rack de musculation maison', 'home gym multifonction', 'velo appartement fitness', 'rameur appartement pliable', 'tapis de course pliable', 'barre de traction porte', 'barre de traction murale', 'poignees pompes rotatives', 'roue abdominaux double', 'banc abdominaux pliable', 'kettlebell reglable', 'bandes elastiques musculation', 'sangles suspension entrainement', 'corde a sauter lestee', 'gants musculation antiderapants', 'ceinture lombaire musculation', 'rouleau massage mousse', 'tapis de sol fitness epais', 'stepper fitness maison', 'disques poids olympiques', 'shaker proteine gradue', 'montre cardio sport',
      // -- Ajout 22/09 : familles absentes du rayon --
      'ballon de football taille 5', 'ballon de basket taille 7', 'ballon de volley exterieur', 'but de football pliable jardin', 'panier de basket sur pied', 'plots entrainement sport lot', 'echelle de rythme agilite', 'chronometre entrainement sport', 'sac de frappe suspendu', 'gants de boxe adulte', 'bandes de boxe sous gants', 'protege dents sport', 'pattes d ours boxe paire', 'tapis puzzle arts martiaux', 'sac de sable entrainement', 'gilet leste entrainement', 'chevillere maintien sport', 'genouillere sport compression', 'manchons compression mollets', 'bandes kinesiologie sport', 'poche de glace reutilisable sport', 'gourde sport 1 litre', 'ceinture hydratation running', 'brassard telephone running', 'serviette sport microfibre', 'sac de sport gym compartiment', 'corde a sauter roulement a billes', 'grip pull up barre traction', 'craie magnesie sport', 'tapis protection sol musculation',
    ],
    keywords: ['haltere', 'banc', 'power tower', 'musculation', 'poids', 'rack', 'home gym', 'velo', 'appartement', 'rameur', 'tapis', 'course', 'barre', 'traction', 'pompe', 'abdominaux', 'kettlebell', 'elastique', 'sangle', 'corde', 'gant', 'ceinture', 'rouleau', 'massage', 'stepper', 'disque', 'shaker', 'montre', 'fitness', 'sport', 'entrainement', 'ballon', 'football', 'basket', 'volley', 'but', 'plot', 'echelle', 'agilite', 'chronometre', 'frappe', 'boxe', 'protege dents', 'patte', 'puzzle', 'arts martiaux', 'sable', 'leste', 'chevillere', 'genouillere', 'manchon', 'compression', 'kinesiologie', 'poche', 'glace', 'gourde', 'hydratation', 'running', 'microfibre', 'grip', 'craie', 'magnesie', 'roulement'],
  },
  {
    slug: 'yoga-bien-etre',
    nameFr: 'Yoga & bien-être',
    emoji: '🧘',
    universe: 'yoga_studio',
    sortOrder: 90,
    // Plus d'appareils d'électrostimulation : ceux que cette recherche
    // ramenait se présentaient comme des « unités TENS » de thérapie — des
    // dispositifs médicaux (cf. BANNED_KEYWORDS).
    searchTerms: ['pistolet massage muscles', 'pistolet massage percussion', 'appareil massage nuque epaules', 'coussin massant chauffant shiatsu', 'appareil massage pieds electrique', 'tapis acupression electrique', 'ceinture massage abdominale', 'appareil massage cervical', 'machine massage jambes compression', 'fauteuil massage portable', 'rouleau massage electrique', 'tapis de yoga antiderapant', 'brique yoga liege', 'sangle yoga etirement', 'roue yoga dos', 'coussin meditation ergonomique', 'hamac yoga aerien', 'diffuseur huiles essentielles ultrasonique', 'humidificateur air chambre', 'lampe luminotherapie reveil', 'bandeau yeux chauffant relaxation', 'bol tibetain meditation', 'balles massage pieds', 'banc etirement dos', 'appareil traction cervicale',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cercle pilates magique', 'ballon de gym pilates', 'mini bandes elastiques pilates', 'barre pilates portable', 'ballon equilibre coussin', 'planche equilibre bois', 'blocs yoga mousse lot', 'sangle transport tapis yoga', 'serviette antiderapante tapis yoga', 'sac tapis yoga bandouliere', 'chaussettes yoga antiderapantes', 'gants pilates antiderapants', 'tapis voyage yoga pliable', 'coussin bolster yoga', 'couverture yoga coton', 'masque yeux lavande relaxation', 'huile essentielle diffusion relaxation', 'galets ceramique diffusion huile', 'brumisateur aromatherapie usb', 'bougie massage cire', 'encens naturel coffret', 'carillon meditation tibetain', 'bol chantant coussin maillet', 'sablier meditation 5 minutes', 'tapis fleurs acupression coussin', 'rouleau jade visage massage', 'gua sha pierre visage', 'roller froid visage', 'chaise meditation ergonomique', 'support mural rangement tapis yoga',
    ],
    keywords: ['massage', 'massant', 'pistolet', 'appareil', 'machine', 'yoga', 'meditation', 'pilates', 'etirement', 'relaxation', 'tapis', 'brique', 'sangle', 'coussin', 'roue', 'hamac', 'diffuseur', 'humidificateur', 'lampe', 'luminotherapie', 'bandeau', 'bol', 'balle', 'banc', 'traction', 'acupression', 'electrostimulation', 'fauteuil', 'rouleau', 'ceinture', 'nuque', 'cervical', 'cercle', 'ballon', 'equilibre', 'bolster', 'lavande', 'essentielle', 'galet', 'ceramique', 'brumisateur', 'aromatherapie', 'encens', 'carillon', 'chantant', 'maillet', 'sablier', 'jade', 'gua sha', 'roller', 'froid', 'yeux'],
  },
  {
    slug: 'coiffure-beaute',
    nameFr: 'Coiffure & beauté',
    emoji: '👩',
    universe: 'hair_salon',
    sortOrder: 100,
    // Second audit : un souffleur d'air pour le nettoyage.
    // Même piège qu'en Barbier : « tondeuse » vaut aussi pour le jardin.
    exclude: ['souffleur', 'ventilateur a jet', 'gazon', 'pelouse', 'debroussailleuse', 'tronconneuse', 'taille haie'],
    searchTerms: ['air styler multifonction cheveux', 'appareil coiffant multifonction rotatif', 'seche cheveux professionnel ionique', 'seche cheveux moteur brushless', 'lisseur cheveux vapeur premium', 'lisseur titane professionnel', 'epilateur lumiere pulsee ipl', 'epilateur ipl corps visage', 'masque led visage photontherapie', 'appareil led visage rajeunissement', 'brosse soufflante volumatrice', 'brosse chauffante lissante', 'coiffeuse table maquillage led', 'miroir maquillage hollywood led', 'appareil soin visage ultrasonique', 'nettoyeur visage sonique', 'appareil radiofrequence visage', 'microcourant lifting visage', 'boucleur automatique cheveux', 'fer a boucler ceramique', 'tondeuse cheveux professionnelle', 'peigne demelant cheveux', 'pinceaux maquillage set', 'bigoudis chauffants rapides', 'ciseaux coiffure professionnel', 'cape coiffure salon',
      // -- Ajout 22/09 : familles absentes du rayon --
      'bonnet satin cheveux nuit', 'taie oreiller satin cheveux', 'pinces sectionnement coiffure', 'chouchous satin sans marque', 'elastiques cheveux spirale', 'perruque cheveux synthetique', 'extensions cheveux a clips', 'bol coloration cheveux kit', 'pinceau application coloration', 'peigne applicateur meches', 'bonnet meches crochet', 'diffuseur seche cheveux boucles', 'rouleaux velcro brushing', 'papillotes bigoudis souples', 'turban microfibre cheveux', 'serviette cheveux absorbante', 'mini lisseur voyage', 'peigne dents larges boucles', 'brosse demelante enfant', 'epilateur electrique femme', 'chauffe cire epilation', 'bandes cire froide corps', 'eponge beaute maquillage', 'nettoyant pinceaux maquillage', 'organiseur maquillage rotatif', 'trousse maquillage professionnelle', 'palette maquillage vide magnetique', 'applicateur fond de teint', 'ceinture porte outils coiffure', 'vaporisateur coiffure brumisateur',
    ],
    keywords: ['cheveux', 'coiffure', 'coiffant', 'styler', 'seche-cheveux', 'seche cheveux', 'lisseur', 'boucleur', 'fer', 'brosse', 'soufflante', 'epilateur', 'ipl', 'lumiere pulsee', 'led', 'visage', 'masque', 'coiffeuse', 'miroir', 'maquillage', 'ultrasonique', 'sonique', 'radiofrequence', 'microcourant', 'lifting', 'tondeuse', 'peigne', 'pinceau', 'bigoudi', 'ciseaux', 'cape', 'appareil', 'nettoyeur', 'soin', 'satin', 'taie', 'chouchou', 'perruque', 'extension', 'coloration', 'applicateur', 'meches', 'velcro', 'papillote', 'turban', 'dents larges', 'demelante', 'epilation', 'palette', 'vaporisateur', 'boucles', 'microfibre', 'bandes cire'],
  },
  {
    slug: 'barbier',
    nameFr: 'Barbier & rasage',
    emoji: '💈',
    universe: 'barber',
    sortOrder: 110,
    // Refusés ici : le premier audit y a trouvé une scie et un rétroviseur de scooter, entrés par « kit » et « miroir ».
    // Et le matériel de jardin : « tondeuse » désigne aussi bien la tondeuse à
    // cheveux que celle à gazon, d'où des brosses de nettoyage de tondeuse à
    // gazon et un support de débroussailleuse dans un rayon de barbier.
    exclude: ['scie', 'retroviseur', 'scooter', 'gazon', 'pelouse', 'debroussailleuse', 'tronconneuse', 'taille haie', 'motoculteur'],
    searchTerms: ['tondeuse barbe professionnelle', 'tondeuse barbe rechargeable', 'kit entretien barbe complet', 'rasoir de surete metal', 'ciseaux barbier professionnel', 'huile a barbe hydratante', 'blaireau rasage poils', 'tondeuse cheveux professionnelle', 'miroir barbier double face', 'peigne barbe bois', 'baume a barbe coiffant', 'tondeuse nez oreilles', 'serviette barbier chauffante', 'chauffe serviette barbier', 'rasoir electrique etanche', 'tete rasoir rotatif', 'pochette rangement barbier', 'tablier barbier impermeable', 'pinceau nettoyage tondeuse', 'shampoing barbe', 'brosse barbe sanglier', 'peigne poche metal', 'affuteur rasoir cuir', 'coffret rasage traditionnel',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cire coiffante homme mate', 'pommade coiffante brillante', 'gel coiffant homme fixation', 'spray texturisant homme', 'poudre volumisante cheveux homme', 'sabots tondeuse guide coupe', 'guide degrade tondeuse', 'tondeuse finition lame foil', 'pochoir barbe forme', 'peigne degrade barbier', 'brosse nuque barbier', 'papier col barbier jetable', 'cape barbier impermeable', 'tabouret barbier reglable', 'steamer serviette chaude', 'baume apres rasage apaisant', 'gommage visage homme', 'creme a raser bol', 'bol rasage ceramique', 'support blaireau rasoir', 'cire a moustache', 'peigne moustache poche', 'ciseaux effilage barbier', 'sac rangement outils barbier', 'huile lubrifiante lame tondeuse', 'brosse nettoyage lame tondeuse', 'miroir main barbier', 'lampe led poste barbier', 'tapis outils barbier', 'porte tondeuse support',
    ],
    keywords: ['barbe', 'rasage', 'rasoir', 'tondeuse', 'barbier', 'moustache', 'blaireau', 'peigne', 'huile', 'baume', 'ciseaux', 'miroir', 'serviette', 'pochette', 'tablier', 'pinceau', 'shampoing', 'brosse', 'affuteur', 'coffret', 'kit', 'tete', 'pommade', 'spray', 'poudre', 'sabot', 'guide', 'degrade', 'lame', 'foil', 'pochoir', 'nuque', 'cape', 'steamer', 'apres rasage', 'gommage', 'effilage', 'lubrifiante', 'porte tondeuse', 'coiffant', 'cire coiffante', 'creme a raser'],
  },
  {
    slug: 'onglerie',
    nameFr: 'Onglerie',
    emoji: '💅',
    universe: 'nail_salon',
    sortOrder: 120,
    // Second audit : un support de clou pneumatique, un porte-rouleau de vinyle et des présentoirs de cuisine.
    exclude: ['menuiserie', 'pneumatique', 'vinyle', 'cuisine', 'articles de the'],
    searchTerms: ['lampe uv led ongles', 'lampe seche ongles professionnelle', 'ponceuse ongles electrique', 'ponceuse ongles professionnelle', 'kit manucure professionnel complet', 'vernis semi permanent gel', 'faux ongles capsules', 'pinceaux nail art', 'strass decoration ongles', 'repose main manucure', 'aspirateur poussiere ongles', 'coupe ongles professionnel', 'base coat top coat', 'stickers ongles decoration', 'gel construction ongles', 'lime ongles electrique', 'poudre acrylique ongles', 'cuticule pousse bois', 'support ongles pratique', 'presentoir vernis rangement', 'kit pedicure professionnel', 'rape pieds electrique', 'sechoir ongles portable', 'pochoir nail art',
      // -- Ajout 22/09 : familles absentes du rayon --
      'presse ongles adhesif', 'colle faux ongles', 'dissolvant vernis doux', 'bol tremper ongles manucure', 'huile cuticule soin', 'creme mains hydratante', 'gants manucure hydratation', 'chaussons pedicure hydratant', 'bain de pieds pliable', 'rape pieds manuelle', 'pierre ponce pieds', 'separateur orteils pedicure', 'vernis a ongles couleur lot', 'vernis effet chrome poudre', 'paillettes ongles decoration', 'feuille transfert ongles', 'ruban adhesif nail art', 'plaque stamping nail art', 'tampon stamping ongles', 'brosse nettoyage ongles', 'lime a ongles verre', 'bloc polissoir ongles', 'pince coupe cuticule', 'ciseaux manucure precision', 'table manucure pliante', 'coussin repose bras manucure', 'tapis silicone manucure', 'rangement vernis mural', 'boite rangement nail art', 'lampe loupe manucure',
    ],
    keywords: ['ongle', 'manucure', 'pedicure', 'vernis', 'nail', 'capsule', 'ponceuse', 'lampe', 'strass', 'coupe-ongles', 'cuticule', 'coat', 'sticker', 'gel', 'lime', 'poudre', 'acrylique', 'support', 'presentoir', 'rape', 'sechoir', 'pochoir', 'aspirateur', 'pinceau', 'repose main', 'kit', 'dissolvant', 'gants', 'chaussons', 'bain de pieds', 'pierre ponce', 'separateur', 'orteil', 'feuille', 'stamping', 'polissoir', 'chrome', 'creme mains'],
  },
  {
    slug: 'cils-sourcils',
    nameFr: 'Cils & sourcils',
    emoji: '👁️',
    universe: 'lash_studio',
    sortOrder: 130,
    // Refusés ici : le premier audit y a trouvé une lampe d'examen de chirurgie dentaire, entrée par « lampe ».
    exclude: ['dentaire', 'chirurgie', 'chirurgical'],
    searchTerms: ['extension de cils professionnel', 'kit extension cils volume russe', 'pince a cils courbe', 'kit rehaussement cils', 'teinture sourcils kit', 'colle extension cils', 'pincettes precision cils', 'serum croissance cils', 'pochoir sourcils forme', 'brosse sourcils double', 'lampe loupe estheticienne', 'patch hydrogel yeux', 'recourbe cils chauffant', 'ventilateur sechage cils', 'plateau colle cils', 'ruban microporeux cils', 'crayon sourcils precision', 'gel fixateur sourcils', 'faux cils magnetiques', 'eyeliner magnetique cils', 'miroir grossissant maquillage', 'ciseaux sourcils precision', 'peigne cils sourcils metal', 'tapis silicone cils',
      // -- Ajout 22/09 : familles absentes du rayon --
      'primer cils extension', 'booster colle cils', 'dissolvant colle cils gel', 'nano mister cils', 'palette cils extension plateau', 'plateau cristal colle cils', 'goupillons jetables cils', 'brosses jetables sourcils lot', 'bandeau jetable estheticienne', 'oreiller cervical cliente institut', 'repose tete table institut', 'tabouret roulettes institut', 'couverture polaire institut', 'henne sourcils coloration', 'cire sourcils epilation', 'fil epilation sourcils', 'pince a epiler professionnelle', 'pochoir sourcils jetable lot', 'regle mesure sourcils', 'compas mesure sourcils', 'crayon blanc trace sourcils', 'savon fixation sourcils', 'masque cils soin', 'anneau lumineux maquillage', 'boite rangement cils extension', 'organiseur outils institut', 'tete entrainement maquillage', 'chariot esthetique roulettes', 'lampe led sans ombre institut',
    ],
    keywords: ['cil', 'cils', 'sourcil', 'sourcils', 'extension', 'rehaussement', 'mascara', 'teinture', 'pince', 'pincette', 'pochoir', 'serum', 'hydrogel', 'lampe', 'loupe', 'recourbe', 'ventilateur', 'plateau', 'ruban', 'crayon', 'gel', 'magnetique', 'eyeliner', 'miroir', 'ciseaux', 'peigne', 'tapis', 'colle', 'brosse', 'patch', 'kit', 'primer', 'booster', 'dissolvant', 'nano mister', 'palette', 'goupillon', 'repose tete', 'henne', 'fil', 'epiler', 'epilation', 'compas', 'anneau lumineux', 'institut', 'coloration', 'maquillage', 'bandeau jetable', 'chariot esthetique'],
  },
  {
    slug: 'tatouage-piercing',
    nameFr: 'Tatouage & piercing',
    emoji: '🪩',
    universe: 'tattoo',
    sortOrder: 140,
    // Refusés ici : le premier audit y a trouvé une pince à barbecue, entrée par « pince ».
    // Second audit : cinq housses de protection pour vélo, moto, voiture ou caméra, et une pince à cérumen.
    exclude: ['barbecue', 'gril', 'steak', 'velo', 'moto', 'voiture', 'automobile', 'camera', 'cerumen'],
    searchTerms: ['bijou piercing titane', 'anneau septum acier chirurgical', 'piercing nombril acier', 'barbell langue titane', 'boucle oreille chirurgicale', 'creole acier inoxydable', 'ecarteur oreille bois', 'faux piercing sans trou', 'creme soin tatouage', 'baume apres tatouage', 'film protecteur tatouage', 'pansement tatouage transparent', 'tatouage temporaire adulte', 'tatouage temporaire realiste', 'pochoir tatouage temporaire', 'crayon transfert tatouage', 'gants nitrile noir', 'lampe loupe studio', 'repose bras tatouage', 'housse protection studio', 'nettoyant piercing solution', 'pince piercing acier', 'coffret piercing assorti', 'presentoir bijoux corps',
      // -- Ajout 22/09 : familles absentes du rayon --
      'bijou piercing arcade', 'piercing helix oreille', 'piercing tragus acier', 'piercing labret levre', 'anneau nez fin', 'piercing industriel barre', 'bijou piercing opale', 'bijou piercing zircon', 'plug oreille silicone', 'tunnel oreille acier', 'chaine piercing corps', 'faux ecarteur oreille', 'henne tatouage temporaire', 'cone henne tatouage', 'tatouage ephemere enfant', 'tatouage temporaire fleur', 'jagua gel tatouage temporaire', 'savon nettoyant tatouage', 'baume cicatrisant tatouage bio', 'ecran solaire tatouage protection', 'boite rangement bijoux piercing', 'organiseur studio tatouage', 'tabouret reglable studio', 'bras articule lampe studio', 'papier transfert tatouage', 'regle mesure piercing', 'pince ouverture anneau', 'presentoir plug oreille', 'kit nettoyage bijoux acier', 'miroir grossissant piercing',
    ],
    keywords: ['tatouage', 'tattoo', 'piercing', 'bijou', 'temporaire', 'septum', 'nombril', 'barbell', 'langue', 'boucle', 'creole', 'ecarteur', 'creme', 'baume', 'film', 'pansement', 'pochoir', 'crayon', 'nitrile', 'lampe', 'loupe', 'repose', 'housse', 'nettoyant', 'pince', 'coffret', 'presentoir', 'anneau', 'gant', 'arcade', 'helix', 'tragus', 'labret', 'nez', 'industriel', 'opale', 'zircon', 'plug', 'tunnel', 'henne', 'jagua', 'ephemere', 'cicatrisant', 'ecran solaire', 'tabouret reglable'],
  },
  {
    slug: 'fleuriste',
    nameFr: 'Fleurs & plantes',
    emoji: '💐',
    universe: 'florist',
    sortOrder: 150,
    // Second audit : un kit électronique Arduino, un support à bananes et un tableau d'épices.
    exclude: ['arduino', 'banane', 'epices'],
    searchTerms: ['kit plantation fleurs debutant', 'kit graines a planter', 'mini serre interieur', 'mini serre chauffante semis', 'jardiniere enfant kit', 'pots biodegradables semis', 'kit culture interieure led', 'kit fleurs sechees bouquet', 'bulbes a planter assortiment', 'kit plantes aromatiques cuisine', 'kit mini potager interieur', 'kit creation bouquet', 'kit decoration florale mariage', 'mousse florale piquage', 'ruban satin fleuriste', 'papier kraft bouquet', 'vase decoratif moderne', 'vase soliflore verre', 'secateur jardinage precision', 'ciseaux floraux fins', 'arrosoir decoratif interieur', 'brumisateur plantes', 'cache pot plante tresse', 'support plante interieur', 'fleurs artificielles decoration', 'guirlande fleurs artificielles', 'etiquettes semis jardin', 'tapis germination graines',
      // -- Ajout 22/09 : familles absentes du rayon --
      'engrais plantes vertes liquide', 'engrais orchidee flacon', 'terreau special semis sac', 'billes argile drainage plantes', 'perles eau retenue arrosage', 'goutte a goutte arrosage automatique', 'globes arrosage plantes verre', 'minuteur arrosage robinet', 'tuyau arrosage extensible', 'pulverisateur pression jardin', 'gants jardinage femme', 'transplantoir set jardinage', 'griffe jardinage main', 'tapis rempotage pliable', 'pot terre cuite plantes', 'soucoupe pot plante lot', 'tuteur plante bambou lot', 'lien attache plante jardinage', 'treillis plante grimpante interieur', 'suspension pot plante macrame', 'etagere plantes escalier interieur', 'lampe horticole plante interieur', 'humidimetre terre plante', 'thermometre jardin exterieur', 'couronne fleurs sechees porte', 'fil de fer fleuriste bobine', 'piques bouquet support floral', 'cellophane bouquet fleuriste', 'boite a fleurs chapeau', 'bouquet fleurs sechees eucalyptus',
    ],
    keywords: ['fleur', 'plante', 'vase', 'bouquet', 'jardinage', 'pot', 'floral', 'secateur', 'arrosoir', 'mousse', 'ruban', 'kraft', 'brumisateur', 'guirlande', 'ciseaux', 'support', 'cache pot', 'serre', 'graine', 'semis', 'bulbe', 'potager', 'aromatique', 'jardiniere', 'kit', 'etiquette', 'tapis germination', 'tapis rempotage', 'germination', 'culture', 'decoration', 'engrais', 'orchidee', 'terreau', 'bille', 'argile', 'drainage', 'arrosage', 'goutte a goutte', 'globe', 'minuteur', 'tuyau', 'extensible', 'pulverisateur', 'transplantoir', 'griffe', 'rempotage', 'terre cuite', 'soucoupe', 'tuteur', 'lien', 'attache', 'treillis', 'grimpante', 'macrame', 'horticole', 'humidimetre', 'couronne', 'sechees', 'fil de fer', 'pique', 'cellophane', 'eucalyptus', 'thermometre jardin'],
  },
  {
    slug: 'animalerie',
    nameFr: 'Animalerie',
    emoji: '🐾',
    universe: 'pet_store',
    sortOrder: 160,
    // Second audit : des sacs d'école, des brosses à cheveux et un tapis de salle de bain.
    // « tondeuse » y désigne la tondeuse de toilettage, pas celle du jardin.
    // Ni « gazon » ni « pelouse » ne sont refusés : le tapis d'herbe
    // artificielle pour chien en est un vrai produit.
    exclude: ['sac a dos d ecole', 'sac a dejeuner', 'brosse a cheveux', 'salle de bain', 'tondeuse a gazon', 'debroussailleuse', 'tronconneuse', 'taille haie'],
    searchTerms: ['harnais chien promenade', 'laisse retractable chien', 'collier lumineux chien', 'gamelle chien inox', 'distributeur croquettes automatique', 'fontaine a eau animaux', 'arbre a chat design', 'griffoir chat carton', 'litiere chat automatique', 'pelle litiere chat', 'jouet chat interactif', 'jouet chien resistant', 'brosse poils animaux', 'gant brosse toilettage', 'coupe griffes animaux', 'tondeuse chien silencieuse', 'sac transport animal avion', 'caisse transport chien', 'coussin panier chien lavable', 'tapis rafraichissant chien', 'barriere securite animaux', 'tapis education chiot', 'sac ramasse crottes', 'distributeur friandises jouet', 'aquarium nano complet', 'cage rongeur equipee',
      // -- Ajout 22/09 : familles absentes du rayon --
      'gamelle anti glouton chien', 'tapis set de gamelles', 'gourde promenade chien', 'boite rangement croquettes hermetique', 'doseur croquettes gradue', 'sac a croquettes voyage', 'clicker dressage chien', 'sifflet dressage chien', 'longe dressage chien 10m', 'harnais anti traction chien', 'tapis de fouille chien', 'jouet distributeur croquettes chien', 'balle lanceur chien', 'peluche sonore chien', 'tunnel de jeu chat', 'herbe a chat pot', 'tapis litiere chat filtrant', 'sac litiere biodegradable', 'desodorisant litiere chat', 'lingettes nettoyantes animaux', 'shampooing chien doux', 'demeloir poils chat', 'ciseaux toilettage bouts ronds', 'baume pattes chien hydratant', 'manteau chien impermeable', 'couverture polaire chien panier', 'grille separation coffre voiture chien', 'housse siege voiture chien', 'mangeoire oiseaux exterieur', 'perchoir cage oiseau bois',
    ],
    keywords: ['chien', 'chat', 'animal', 'animaux', 'harnais', 'laisse', 'gamelle', 'niche', 'griffoir', 'litiere', 'croquette', 'collier', 'panier', 'fontaine', 'arbre a chat', 'jouet', 'brosse', 'gant', 'coupe griffe', 'tondeuse', 'sac', 'caisse', 'coussin', 'tapis', 'barriere', 'friandise', 'aquarium', 'cage', 'rongeur', 'distributeur', 'pelle', 'anti glouton', 'gourde', 'doseur', 'hermetique', 'clicker', 'dressage', 'sifflet', 'longe', 'anti traction', 'fouille', 'lanceur', 'peluche', 'tunnel', 'herbe a chat', 'filtrant', 'biodegradable', 'desodorisant', 'shampooing', 'demeloir', 'patte', 'manteau', 'mangeoire', 'oiseau', 'perchoir', 'toilettage', 'promenade', 'nettoyante'],
  },
  {
    slug: 'cuisine',
    nameFr: 'Équipement cuisine',
    emoji: '🍳',
    universe: 'restaurant',
    sortOrder: 170,
    // Second audit : des boîtes à pilules, à cosmétiques et à blocs de construction.
    exclude: ['pilule', 'cosmetique', 'blocs de construction'],
    searchTerms: ['ustensiles cuisine silicone', 'couteau chef professionnel', 'set couteaux cuisine japonais', 'balance cuisine precision', 'organisateur cuisine rangement', 'mandoline legumes multifonction', 'planche a decouper bambou', 'robot petrin manuel', 'moule patisserie silicone', 'thermometre cuisine numerique', 'presse ail inox', 'essoreuse salade', 'boites conservation hermetiques', 'machine sous vide alimentaire', 'hachoir manuel legumes', 'rape multifonction inox', 'passoire pliable silicone', 'pichet doseur gradue', 'fouet inox professionnel', 'spatule silicone haute temperature', 'aiguiseur couteaux professionnel', 'egouttoir vaisselle inox', 'distributeur epices rotatif', 'tapis patisserie silicone', 'moulin poivre electrique', 'poele antiadhesive induction',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cocotte fonte emaillee', 'faitout inox induction', 'plat a four ceramique', 'moule a gratin rectangulaire', 'lechefrite four accessoire', 'panier vapeur inox pliable', 'cuit oeuf micro ondes', 'couvercle anti projection micro ondes', 'bocaux verre conservation lot', 'couvercles silicone extensibles', 'pompe sous vide bocaux', 'sacs congelation reutilisables', 'etiquettes congelation effacables', 'dessous de plat silicone', 'set salieres poivrieres', 'saucier verseur inox', 'plat de service porcelaine', 'corbeille a pain osier', 'brosse vaisselle manche', 'eponge inox casserole', 'raclette evier silicone', 'tablier cuisine impermeable', 'maniques silicone four', 'gants anti chaleur four', 'minuteur cuisine magnetique', 'entonnoir cuisine inox set', 'verre doseur gradue inox', 'denoyauteur cerises manuel', 'econome legumes ergonomique', 'ciseaux de cuisine demontables',
    ],
    keywords: ['cuisine', 'ustensile', 'couteau', 'casserole', 'poele', 'culinaire', 'chef', 'planche', 'mandoline', 'moule', 'balance', 'thermometre', 'conservation', 'patisserie', 'robot', 'petrin', 'presse', 'essoreuse', 'machine', 'hachoir', 'rape', 'passoire', 'pichet', 'fouet', 'spatule', 'aiguiseur', 'egouttoir', 'distributeur', 'tapis', 'moulin', 'boite', 'set', 'organisateur', 'cocotte', 'fonte', 'faitout', 'plat', 'four', 'gratin', 'lechefrite', 'vapeur', 'micro ondes', 'couvercle', 'bocal', 'bocaux', 'congelation', 'dessous de plat', 'saliere', 'poivriere', 'saucier', 'service', 'corbeille', 'raclette', 'tablier', 'manique', 'minuteur', 'entonnoir', 'denoyauteur', 'econome', 'porcelaine', 'brosse vaisselle', 'verre doseur'],
  },
  {
    slug: 'bricolage',
    nameFr: 'Bricolage & outils',
    emoji: '🔧',
    sortOrder: 180,
    // Second audit : des lampes de table, de bureau et de sauna.
    exclude: ['lampe de table', 'lampe de bureau', 'sauna'],
    searchTerms: ['set tournevis precision', 'tournevis electrique rechargeable', 'metre laser telemetre', 'niveau laser croix', 'perceuse sans fil professionnelle', 'visseuse a chocs sans fil', 'boite a outils complete', 'servante atelier rangement', 'pistolet a colle chaude', 'pince multiprise reglable', 'set pinces professionnelles', 'scie sauteuse electrique', 'scie circulaire portable', 'detecteur metaux mur', 'etabli pliant portable', 'etau etabli pivotant', 'visserie assortiment coffret', 'chevilles assortiment coffret', 'lunettes protection bricolage', 'casque antibruit chantier', 'multimetre numerique', 'fer a souder station', 'ponceuse excentrique electrique', 'meuleuse angulaire compacte', 'lampe atelier rechargeable', 'rangement mural outils',
      // -- Ajout 22/09 : familles absentes du rayon --
      'niveau a bulle aluminium', 'equerre de menuisier metal', 'cordeau traceur poudre', 'crayon charpentier lot', 'pistolet a peinture electrique', 'rouleau peinture kit bac', 'pinceaux peinture murale set', 'bache protection peinture', 'ruban de masquage peinture', 'enduit rebouchage spatule', 'cle a molette reglable', 'cle serre tube plomberie', 'joint teflon plomberie', 'furet deboucheur canalisation', 'ventouse deboucheur evier', 'pince a denuder automatique', 'testeur de tension electrique', 'domino connecteur electrique lot', 'gaine thermoretractable lot', 'serre cables nylon lot', 'pistolet mastic silicone', 'colle forte bi composant', 'ruban adhesif double face fort', 'agrafeuse murale agrafes', 'marteau arrache clou', 'gants de travail anti coupure', 'masque poussiere chantier lot', 'genouilleres travail chantier', 'casier rangement visserie tiroirs', 'sac a outils bandouliere',
    ],
    keywords: ['outil', 'bricolage', 'tournevis', 'perceuse', 'visseuse', 'cle', 'atelier', 'scie', 'niveau', 'laser', 'etabli', 'pince', 'marteau', 'vis', 'colle', 'detecteur', 'protection', 'servante', 'etau', 'visserie', 'cheville', 'lunette', 'casque', 'multimetre', 'fer a souder', 'ponceuse', 'meuleuse', 'lampe', 'rangement', 'metre', 'set', 'boite', 'pistolet', 'bulle', 'equerre', 'menuisier', 'cordeau', 'traceur', 'bac', 'masquage', 'enduit', 'rebouchage', 'molette', 'tube', 'plomberie', 'joint', 'teflon', 'furet', 'deboucheur', 'canalisation', 'denuder', 'testeur', 'tension', 'domino', 'connecteur', 'gaine', 'thermoretractable', 'serre cable', 'mastic', 'adhesif', 'double face', 'agrafeuse', 'agrafe', 'clou', 'poussiere', 'genouillere', 'casier', 'gant de travail', 'gants de travail', 'murale', 'evier', 'crayon charpentier'],
  },
  {
    slug: 'photo-creation',
    nameFr: 'Photo & création',
    emoji: '📸',
    universe: 'photo_spot',
    sortOrder: 190,
    searchTerms: ['trepied smartphone photo', 'trepied appareil photo professionnel', 'ring light photo studio', 'panneau led video studio', 'stabilisateur gimbal smartphone', 'stabilisateur camera 3 axes', 'objectif clip smartphone', 'filtre objectif polarisant', 'fond studio photo tissu', 'support fond studio', 'micro cravate smartphone', 'micro canon camera', 'softbox eclairage studio', 'parapluie photo studio', 'teleprompteur smartphone', 'declencheur bluetooth photo', 'carte memoire haute vitesse', 'sac photo appareil rembourre', 'boite lumiere produit photo', 'table photo produit', 'reflecteur photo pliable', 'bras articule studio', 'fond vert chroma key', 'presentoir photo produit',
      // -- Ajout 22/09 : familles absentes du rayon --
      'batterie externe camera usb', 'chargeur double batterie appareil photo', 'adaptateur secteur studio led', 'rallonge alimentation studio', 'rotule ball head trepied', 'plaque rapide trepied rail', 'perche telescopique camera', 'cage protection camera', 'pince magic arm studio', 'ventouse support camera', 'kit nettoyage objectif', 'poire soufflette nettoyage objectif', 'lingettes nettoyage objectif', 'silice absorbeur humidite boitier', 'boite seche appareil photo', 'valise rigide appareil photo', 'courroie appareil photo', 'harnais double appareil photo', 'fond papier photo rouleau', 'plateau acrylique photo produit', 'fond marbre photo culinaire', 'pince fond studio lot', 'bonnette anti vent micro', 'perche micro studio', 'casque monitoring studio', 'cable xlr micro studio', 'interface audio usb micro', 'cle usb stockage video', 'disque dur externe video', 'lecteur carte memoire usb',
    ],
    keywords: ['photo', 'trepied', 'ring light', 'gimbal', 'stabilisateur', 'objectif', 'studio', 'eclairage', 'micro', 'softbox', 'parapluie', 'filtre', 'carte memoire', 'declencheur', 'teleprompteur', 'fond', 'support', 'boite', 'table', 'reflecteur', 'bras', 'chroma', 'presentoir', 'sac', 'panneau', 'camera', 'video', 'batterie', 'rotule', 'plaque', 'rail', 'perche', 'cage', 'poire', 'soufflette', 'silice', 'humidite', 'courroie', 'harnais', 'marbre', 'bonnette', 'xlr', 'interface', 'cle usb', 'disque dur', 'lecteur', 'monitoring'],
  },
  {
    slug: 'cafe-the',
    nameFr: 'Café & thé',
    emoji: '☕',
    universe: 'cafe',
    sortOrder: 200,
    // Second audit : un porte-dosettes de lave-vaisselle, un porte-stylo et des plateaux à cosmétiques.
    exclude: ['lave-vaisselle', 'porte-stylo', 'lotion', 'bijou'],
    searchTerms: ['moulin a cafe manuel', 'moulin a cafe electrique', 'cafetiere italienne inox', 'presse francaise cafe', 'cafetiere filtre goutte', 'theiere en verre infuseur', 'mousseur a lait electrique', 'balance cafe precision', 'filtre cafe reutilisable', 'boite conservation cafe', 'infuseur the inox', 'tasses expresso set', 'tamper cafe professionnel', 'pichet lait barista', 'machine expresso portable', 'distributeur dosettes rangement', 'plateau service the', 'bouilloire col de cygne', 'thermometre lait barista', 'tapis barista silicone', 'set degustation the', 'porte capsules rotatif', 'mug isotherme cafe', 'carafe cafe filtre',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cafetiere v60 dripper', 'support dripper cafe', 'filtres papier v60 lot', 'carafe chemex verre', 'cafetiere cold brew verre', 'bouteille infusion cold brew', 'filtre inox permanent cone', 'detartrant machine expresso', 'pastilles nettoyage machine cafe', 'brosse nettoyage groupe cafe', 'pinceau nettoyage moulin cafe', 'bac de rangement marc de cafe', 'repartiteur cafe wdt outil', 'niveleur cafe reglable', 'pochoir latte art', 'stylo latte art inox', 'tasses cappuccino porcelaine', 'verres double paroi the', 'sous tasses feutre lot', 'cuilleres a cafe inox lot', 'boite a the compartiments', 'pince a the inox', 'sachets the vides filtre', 'boule infuseur the chaine', 'passoire a the fine', 'theiere fonte japonaise', 'chauffe theiere bougie', 'set matcha bol fouet', 'fouet bambou matcha chasen', 'porte dosettes tiroir rangement',
    ],
    keywords: ['cafe', 'the', 'barista', 'cafetiere', 'theiere', 'moulin', 'expresso', 'infuseur', 'mousseur', 'filtre', 'tasse', 'tamper', 'pichet', 'machine', 'distributeur', 'plateau', 'bouilloire', 'thermometre', 'tapis', 'set', 'capsule', 'mug', 'carafe', 'balance', 'boite', 'dripper', 'v60', 'chemex', 'cold brew', 'permanent', 'detartrant', 'pastille', 'marc', 'repartiteur', 'wdt', 'niveleur', 'pochoir', 'latte', 'cappuccino', 'porcelaine', 'double paroi', 'sous tasse', 'cuillere', 'sachet', 'boule', 'passoire', 'fonte', 'chauffe', 'matcha', 'chasen', 'tiroir'],
  },
  {
    slug: 'meuble-deco',
    nameFr: 'Meuble & déco',
    emoji: '🛋️',
    sortOrder: 210,
    searchTerms: ['etagere murale bois design', 'etagere echelle decorative', 'meuble rangement modulable', 'commode tiroirs tissu', 'coussin decoratif salon', 'housse coussin lin', 'tapis salon moderne', 'tapis entree antiderapant', 'suspension luminaire design', 'lampe poser design salon', 'miroir decoratif mural', 'miroir sur pied plein', 'cadre photo mural set', 'porte photo mural design', 'plante artificielle decoration', 'panier osier rangement deco', 'rideau occultant chambre', 'voilage decoratif fenetre', 'organiseur rangement modulable', 'boite rangement decorative', 'table appoint pliante', 'table basse gigogne', 'guirlande led decoration interieure', 'applique murale led', 'porte manteau mural design', 'tete de lit decorative',
      // -- Ajout 22/09 : familles absentes du rayon --
      'horloge murale silencieuse design', 'horloge a poser retro', 'patere murale bois lot', 'porte parapluie entree', 'banc entree rangement chaussures', 'meuble a chaussures pivotant', 'parure de lit coton lavee', 'plaid jete de canape tricot', 'tapis de bain moelleux', 'rideau de douche design', 'tableau decoratif toile mural', 'affiche encadree decoration murale', 'papier peint adhesif decoratif', 'cache pot ceramique design', 'support plantes metal etage', 'suspension macrame plante', 'vase decoratif ceramique', 'bougie parfumee verre deco', 'diffuseur batonnets parfum maison', 'photophore verre decoratif', 'lanterne decorative interieure', 'plateau decoratif table basse', 'corbeille jute rangement', 'paravent separateur piece', 'pouf coffre rangement', 'tabouret bois appoint', 'console entree etroite', 'desserte roulante rangement', 'coussin de sol grande taille', 'rideau thermique isolant',
    ],
    keywords: ['meuble', 'etagere', 'rangement', 'coussin', 'housse', 'tapis', 'luminaire', 'suspension', 'lampe', 'applique', 'miroir', 'cadre', 'photo', 'decoration', 'deco', 'decorative', 'rideau', 'voilage', 'table', 'guirlande', 'organiseur', 'boite', 'panier', 'plante', 'commode', 'tiroir', 'porte manteau', 'tete de lit', 'porte photo', 'horloge', 'patere', 'porte parapluie', 'chaussure', 'pivotant', 'parure', 'lit', 'jete', 'bain', 'tableau', 'affiche', 'papier peint', 'cache pot', 'macrame', 'vase', 'parfumee', 'parfum', 'batonnet', 'photophore', 'corbeille', 'jute', 'paravent', 'pouf', 'console', 'desserte', 'thermique', 'isolant', 'entree', 'ceramique', 'adhesif', 'tabouret bois'],
  },
  {
    slug: 'auto-moto',
    nameFr: 'Auto & moto',
    emoji: '🚗',
    universe: 'garage',
    sortOrder: 220,
    searchTerms: ['organisateur coffre voiture', 'support telephone voiture magnetique', 'aspirateur voiture portable', 'camera de recul voiture', 'dashcam voiture full hd', 'compresseur pneu portable', 'chargeur allume cigare rapide', 'tapis de sol voiture', 'housse siege voiture universelle', 'pare soleil voiture pliable', 'nettoyant jantes auto', 'kit lavage voiture microfibre', 'alarme antivol voiture', 'demarreur batterie portable', 'manometre pression pneus', 'coffre de toit souple', 'housse moto impermeable', 'gants moto ete', 'antivol moto disque', 'sacoche reservoir moto', 'support telephone moto guidon', 'protection reservoir moto', 'kit reparation crevaison auto', 'organisateur siege arriere',
      // -- Ajout 22/09 : familles absentes du rayon --
      'coussin lombaire siege voiture', 'appui tete voiture confort', 'accoudoir central voiture', 'tablette voiture repas', 'desodorisant voiture parfum', 'purificateur air voiture', 'led interieur voiture ambiance', 'ampoule led phare voiture', 'lampe coffre led sans fil', 'bache protection voiture exterieur', 'housse pare-brise antigel', 'raclette degivrage pare-brise', 'testeur batterie voiture', 'multimetre diagnostic auto', 'valise outils voiture', 'renovateur phares jaunis', 'polish carrosserie voiture', 'brosse nettoyage jantes', 'chiffon microfibre auto lot', 'filet de coffre voiture', 'barre de toit universelle', 'sangle arrimage remorque', 'bequille atelier moto', 'couvre selle moto', 'protege disque frein moto', 'intercom moto bluetooth', 'chargeur usb voiture multiport', 'miroir surveillance siege arriere', 'entonnoir vidange huile auto',
    ],
    keywords: ['voiture', 'auto', 'moto', 'vehicule', 'coffre', 'pneu', 'allume-cigare', 'allume cigare', 'tapis de sol', 'housse', 'camera de recul', 'dashcam', 'jante', 'pare-soleil', 'pare soleil', 'casque', 'gant', 'alarme', 'antivol', 'demarreur', 'manometre', 'sacoche', 'support', 'nettoyant', 'kit', 'compresseur', 'aspirateur', 'organisateur', 'protection', 'reservoir', 'siege', 'appui tete', 'accoudoir', 'desodorisant', 'purificateur', 'antigel', 'raclette', 'degivrage', 'testeur', 'multimetre', 'renovateur', 'polish', 'chiffon', 'microfibre', 'barre de toit', 'bequille', 'selle', 'intercom', 'entonnoir', 'phare', 'sangle arrimage'],
  },
  {
    slug: 'velo-mobilite',
    nameFr: 'Vélo & mobilité',
    emoji: '🚴',
    sortOrder: 230,
    // Second audit : une luge électrique.
    exclude: ['luge', 'quad', 'moto cross'],
    searchTerms: ['velo vtt 26 pouces adulte', 'velo vtt 27.5 pouces suspension', 'velo ville adulte 28 pouces', 'velo pliant adulte', 'velo enfant 20 pouces', 'velo ado 24 pouces', 'velo route aluminium', 'velo electrique pliant adulte', 'velo electrique ville batterie', 'vtt electrique adulte', 'trottinette electrique adulte', 'trottinette electrique pliable', 'trottinette enfant 3 roues', 'gyroroue electrique adulte', 'hoverboard tout terrain', 'skateboard electrique', 'draisienne enfant equilibre', 'tricycle enfant evolutif', 'antivol velo securite', 'casque velo adulte', 'sacoche velo etanche', 'eclairage velo led rechargeable', 'pompe velo portable', 'compteur velo sans fil', 'support telephone velo', 'selle velo confort gel', 'kit reparation crevaison velo', 'porte bagage velo',
      // -- Ajout 22/09 : familles absentes du rayon --
      'chambre a air velo 26', 'pneu velo ville 700', 'demonte pneu velo lot', 'multi outil velo pliant', 'cle a rayons velo', 'derive chaine velo outil', 'lubrifiant chaine velo', 'degraissant chaine velo', 'brosse nettoyage transmission velo', 'patins de frein velo', 'plaquettes frein disque velo', 'cable et gaine frein velo', 'pedales velo antiderapantes', 'poignees guidon velo ergonomiques', 'ruban guidon velo route', 'garde boue velo clipsable', 'bequille velo reglable', 'panier avant velo amovible', 'remorque bagage velo', 'sacoche porte bagage double', 'filet porte bagage velo', 'sonnette velo guidon', 'retroviseur velo guidon', 'gilet reflechissant velo', 'brassard led course nuit', 'gants velo demi doigts', 'couvre selle velo impermeable', 'housse velo exterieur protection', 'support mural velo rangement', 'pied d atelier velo reparation',
    ],
    keywords: ['velo', 'vtt', 'bicyclette', 'cycliste', 'cyclisme', 'trottinette', 'gyroroue', 'hoverboard', 'skateboard', 'draisienne', 'tricycle', 'electrique', 'antivol', 'sacoche', 'casque', 'pompe', 'compteur', 'selle', 'crevaison', 'bidon', 'eclairage', 'support', 'porte bagage', 'roue', 'batterie', 'pliant', 'pliable', 'adulte', 'enfant', 'pouce', 'chambre a air', 'pneu', 'demonte pneu', 'multi outil', 'rayon', 'derive', 'lubrifiant', 'degraissant', 'transmission', 'patin', 'frein', 'plaquette', 'gaine', 'pedale', 'poignee', 'guidon', 'garde boue', 'bequille', 'remorque', 'sonnette', 'retroviseur', 'reflechissant', 'couvre selle', 'pied d atelier', 'reparation', 'brassard led'],
  },
  {
    slug: 'mode-accessoires',
    nameFr: 'Mode & accessoires',
    emoji: '👜',
    sortOrder: 240,
    // Remplace Soiree & karaoke (retire le 21/09 : 52 % de titres mal
    // rattaches au dernier audit, chevauchait massivement Fetes &
    // decoration). Aucun rayon ne couvrait la mode — sacs, lunettes,
    // ceintures, foulards, chapeaux — grosse famille de produits sur
    // AliExpress, absente du catalogue jusqu'ici.
    //
    // La mode est la famille la plus contrefaite d'AliExpress : les marques
    // de luxe correspondantes sont dans BANNED_KEYWORDS (liste globale), pas
    // ici — un « sac Gucci » est refuse partout, pas seulement dans ce rayon.
    searchTerms: [
      // -- Sacs --
      'sac a main femme tendance', 'sac bandouliere femme', 'sac a dos mode femme', 'pochette soiree femme', 'sac cabas femme grande capacite', 'petit sac a main chaine', 'sac besace homme', 'sac banane mode fashion',
      // -- Lunettes de soleil --
      'lunettes de soleil femme tendance', 'lunettes de soleil homme classique', 'lunettes de soleil retro vintage', 'lunettes de soleil oversize',
      // -- Ceintures --
      'ceinture cuir homme boucle', 'ceinture femme tendance', 'ceinture tressee mode',
      // -- Foulards et echarpes --
      'foulard soie femme motif', 'echarpe mode femme hiver', 'bandana mode accessoire', 'chale mode femme elegant',
      // -- Chapeaux --
      'chapeau de paille femme ete', 'casquette mode unisexe', 'bob mode unisexe', 'beret mode femme', 'bonnet mode hiver',
      // -- Portefeuilles et petite maroquinerie --
      'portefeuille femme cuir tendance', 'portefeuille homme cuir slim', 'porte carte cuir mode', 'porte monnaie femme tendance',
      // -- Gants mode --
      'gants mode femme hiver elegant', 'gants cuir homme mode',
      // -- Bijoux fantaisie et cheveux --
      'collier fantaisie mode femme', 'bracelet fantaisie mode femme', 'boucles d oreilles fantaisie tendance', 'epingle a cheveux mode', 'barrette cheveux mode femme', 'headband mode femme', 'pince a cheveux mode',
      // -- Autres accessoires --
      'porte cles mode fantaisie', 'bandeau cheveux mode', 'noeud papillon homme mode', 'cravate homme mode', 'bretelles homme mode', 'broche mode fantaisie', 'chaussettes mode motif', 'gilet sans manche mode femme', 'kimono plage femme mode', 'housse de telephone mode fashion', 'porte passeport mode fashion', 'parapluie mode fashion',
    
      // -- Ajout 22/09 : familles absentes du rayon --
      'sac ordinateur portable femme mode', 'sac week end voyage mode', 'sac filet courses mode', 'sac seau femme tendance', 'sac transparent mode', 'chaine de sac bandouliere rechange', 'organiseur interieur sac a main', 'cordon lunettes mode', 'etui a lunettes rigide mode', 'chaine de lunettes perles', 'mitaines laine femme mode', 'cache cou polaire mode', 'tour de cou tricot hiver', 'chapeau feutre femme mode', 'visiere mode unisexe', 'foulard cheveux satin mode', 'chouchou satin mode', 'pince crabe cheveux mode', 'etui carte bancaire anti rfid', 'trousse maquillage mode voyage', 'pochette bijoux voyage mode', 'cintres velours fins lot', 'housse vetements protection penderie', 'brosse anti peluche vetements', 'embauchoirs chaussures bois', 'ceinture chaine mode femme', 'bretelles fines mode femme', 'gants tactiles mode hiver', 'parapluie pliant automatique mode',
    ],
    keywords: ['sac', 'pochette', 'lunettes de soleil', 'ceinture', 'foulard', 'echarpe', 'bandana', 'chale', 'chapeau', 'casquette', 'bob', 'beret', 'bonnet', 'portefeuille', 'porte carte', 'porte monnaie', 'gants mode', 'collier', 'bracelet', 'boucle d oreille', 'epingle', 'barrette', 'headband', 'pince a cheveux', 'porte cles', 'bandeau', 'noeud papillon', 'cravate', 'bretelles', 'broche', 'chaussettes', 'gilet', 'kimono', 'housse de telephone', 'porte passeport', 'parapluie', 'mode', 'fantaisie', 'tendance', 'fashion', 'ordinateur', 'week end', 'transparent', 'chaine de sac', 'cordon', 'mitaine', 'cache cou', 'tour de cou', 'feutre', 'visiere', 'satin', 'chouchou', 'pince crabe', 'rfid', 'cintre', 'penderie', 'peluche', 'embauchoir', 'tactile', 'pliant', 'laine', 'vetement', 'chaussure', 'bijoux', 'polaire', 'hiver', 'cheveux', 'chaine de lunettes'],
  },
  {
    slug: 'nettoyage',
    nameFr: 'Nettoyage & entretien',
    emoji: '🧽',
    sortOrder: 250,
    // Pas d'`universe` : aucun univers de lieux YUMIA ne correspond, à la
    // différence de Lecture qui pointait vers les librairies.
    //
    // Refusés ici : « nettoyage » et « brosse » sont les deux mots les plus
    // galvaudés d'AliExpress. Sans ces refus, le rayon se remplit de
    // nettoyants pour le visage, de cure-oreilles, de brosses de toilettage
    // et de kits pour objectif photo — tous déjà vendus ailleurs.
    // « barbecue » a ramené trois cuisines d'extérieur complètes, meuble et
    // réfrigérateur compris, alors qu'on ne cherche que la brosse à grille.
    exclude: ['oreille', 'nez', 'dents', 'visage', 'peau', 'maquillage', 'cheveux', 'toilettage', 'objectif', 'capteur', 'aquarium', 'piscine', 'tatouage', 'ongle', 'barbe', 'tondeuse a gazon', 'chaussure', 'cuisine exterieure', 'refrigerateur', 'armoire', 'huile'],
    searchTerms: [
      'nettoyeur haute pression electrique', 'nettoyeur haute pression sans fil',
      'lance haute pression rallonge', 'buse rotative haute pression',
      'brosse rotative nettoyeur pression', 'pistolet lavage jardin tuyau',
      'nettoyeur gouttiere telescopique', 'brosse terrasse exterieur manche',
      'balai exterieur cour jardin', 'brosse nettoyage barbecue grille',
      'nettoyeur vapeur multifonction', 'balai vapeur sol electrique',
      'nettoyeur vapeur main portable', 'aspirateur balai sans fil',
      'aspirateur robot laveur', 'aspirateur main rechargeable',
      'aspirateur eau et poussiere', 'sac aspirateur rechange lot',
      'filtre hepa aspirateur rechange', 'injecteur extracteur nettoyage tissu',
      'balai serpillere microfibre rotatif', 'seau essoreur balai rotatif',
      'balai plat microfibre lingettes', 'raclette sol eau douche',
      'brosse recurer sol manche', 'nettoyeur sol electrique sans fil',
      'ramasse poussiere balayette set', 'serpillere rechange microfibre lot',
      'raclette vitre professionnelle', 'robot lave vitre aspirant',
      'nettoyeur vitre electrique aspiration', 'chiffon microfibre vitres lot',
      'brosse telescopique vitres exterieur', 'kit lavage voiture complet',
      'gant microfibre lavage voiture', 'brosse jantes voiture detailing',
      'seau lavage voiture grille', 'cire polish voiture applicateur',
      'brosse detailing interieur voiture', 'brosse vaisselle distributeur savon',
      'panier couverts lave vaisselle', 'pastilles nettoyage lave vaisselle',
      'filtre lave vaisselle rechange', 'eponge magique melamine lot',
      'pierre d argile nettoyante', 'brosse wc support silicone',
      'ventouse debouchage wc', 'brosse joints carrelage salle de bain',
      'raclette douche paroi vitree', 'pastilles effervescentes canalisation',
      'nettoyeur ultrason bijoux lunettes', 'brosse nettoyage clavier ordinateur',
      'kit nettoyage ecran telephone', 'souffleur air poussiere electronique',
      'plumeau microfibre telescopique', 'rouleau adhesif anti peluche vetements',
      'brosse anti poils animaux canape', 'gants menage caoutchouc lot',
      'tablier menage impermeable', 'chariot menage seau essoreur',
      'porte balai mural rangement', 'poubelle pedale inox cuisine',
      'lingettes nettoyantes multi usages lot', 'pulverisateur menage vide',
      'seau pliable menage silicone',
    ],
    keywords: ['nettoyeur', 'nettoyage', 'nettoyante', 'haute pression', 'buse', 'pistolet lavage', 'gouttiere', 'terrasse', 'balai', 'barbecue', 'vapeur', 'aspirateur', 'sac aspirateur', 'filtre hepa', 'injecteur extracteur', 'serpillere', 'essoreur', 'raclette', 'recurer', 'ramasse poussiere', 'balayette', 'lave vitre', 'chiffon microfibre', 'gant microfibre', 'telescopique', 'lavage voiture', 'detailing', 'jantes', 'polish', 'vaisselle', 'lave vaisselle', 'eponge magique', 'melamine', 'pierre d argile', 'wc', 'debouchage', 'joints carrelage', 'paroi vitree', 'effervescente', 'canalisation', 'ultrason', 'clavier', 'ecran telephone', 'souffleur air', 'plumeau', 'anti peluche', 'anti poils', 'gants menage', 'tablier menage', 'chariot menage', 'porte balai', 'poubelle', 'lingettes nettoyantes', 'pulverisateur menage', 'seau pliable', 'seau lavage', 'seau essoreur', 'panier couverts', 'brosse rotative', 'brosse telescopique'],
  },
  {
    slug: 'bijoux-montres',
    nameFr: 'Bijoux & montres',
    emoji: '💍',
    universe: 'jewelry',
    sortOrder: 260,
    // Refusés ici : le premier audit y a trouvé un soutien-gorge, entré par « acier » (armatures).
    // Second audit : une épée chinoise, une barre d'acier Damas et une lame industrielle.
    exclude: ['soutien-gorge', 'lingerie', 'culotte', 'epee', 'lame', 'couteau', 'damas'],
    searchTerms: ['collier acier inoxydable femme', 'collier homme chaine acier', 'bracelet cuir homme tresse', 'bracelet jonc femme acier', 'montre automatique homme squelette', 'montre femme bracelet maille', 'montre homme chronographe acier', 'montre minimaliste unisexe', 'boucles oreilles argent 925', 'creoles acier dorees', 'bague acier femme reglable', 'chevaliere homme acier', 'chaine cheville femme', 'pendentif argent 925', 'bracelet perles pierre naturelle', 'collier pierre naturelle', 'broche vintage elegante', 'parure bijoux mariage', 'coffret rangement bijoux', 'boite montre rangement', 'remontoir montre automatique', 'outil reglage bracelet montre', 'presentoir bijoux comptoir', 'pochette voyage bijoux',
      // -- Ajout 22/09 : familles absentes du rayon --
      'bracelet montre cuir rechange', 'bracelet montre silicone sport', 'bracelet montre milanais acier', 'coussin montre rangement', 'chiffon polish argent bijoux', 'bain ultrasons nettoyage bijoux', 'gourmette homme gravee', 'bracelet cuir tresse homme', 'boucles oreilles clips sans trou', 'medaillon photo personnalise', 'medaille bapteme gravee', 'croix pendentif argent', 'bracelet breloques charms', 'breloque charm argent', 'bracelet amethyste pierre', 'bracelet quartz rose', 'collier plaque or fin', 'bague acier doree femme', 'bague reglable ajustable', 'anneau titane homme', 'bijoux enfant fille lot', 'valise rangement bijoux', 'arbre a bijoux support', 'porte bagues presentoir', 'ecrin bague velours', 'boite a bijoux miroir', 'rallonge chaine collier', 'fermoir aimante collier',
    ],
    keywords: ['bijou', 'collier', 'bracelet', 'bague', 'montre', 'pendentif', 'chaine', 'boucle', 'argent', 'acier', 'perle', 'broche', 'cheville', 'coffret', 'boucle d oreille', 'creole', 'chevaliere', 'parure', 'pierre', 'remontoir', 'outil', 'presentoir', 'pochette', 'boite', 'jonc', 'bracelet montre', 'cuir', 'milanais', 'chiffon', 'polish', 'ultrasons', 'gourmette', 'clips', 'medaillon', 'medaille', 'croix', 'breloque', 'charm', 'amethyste', 'quartz', 'plaque or', 'titane', 'arbre', 'porte bagues', 'ecrin', 'velours', 'fermoir'],
  },
  {
    slug: 'jouets-cadeaux',
    nameFr: 'Jouets & cadeaux',
    emoji: '🎁',
    sortOrder: 280,
    /**
     * Les porteurs électriques pour enfants (12 V, 24 V) sont ici des
     * jouets ordinaires, et c'est ce que le rayon cherche. Ce qui reste
     * refusé, c'est le thermique et la grosse puissance : sous le nom
     * « quad enfant », AliExpress renvoie aussi de vrais engins de 60 V
     * et 1 200 W, et des mini-motos à essence sans aucune certification.
     *
     * « figurine » figure dans les mots-clés alors qu'il est dans la
     * camelote globale : c'est le mécanisme prévu pour qu'un rayon qui
     * vend précisément cet objet ne se le voie pas jeter.
     */
    exclude: ['thermique', 'essence', '2 temps', '4 temps', '48v', '60v', '72v', '1000w', '1500w', '2000w', '3000w', 'casque de velo', 'casque velo', 'casque enfant velo', 'casque de trottinette', 'casque de protection', 'perle', 'bille', 'strass', 'gomme', 'trombone', 'confetti', 'bracelet elastique'],
    searchTerms: [
      'voiture electrique enfant 12v', 'voiture electrique enfant 24v',
      'quad electrique enfant 12v', 'moto electrique enfant 6v',
      'buggy electrique enfant telecommande', 'tracteur electrique enfant remorque',
      'porteur electrique enfant batterie', 'kart a pedales enfant',
      'batterie 12v voiture enfant rechange', 'chargeur voiture electrique enfant',
      'voiture telecommandee tout terrain rapide', 'voiture rc 4x4 echelle 1 10',
      'camion telecommande benne', 'buggy telecommande rc batterie',
      'voiture drift telecommandee', 'bateau telecommande piscine',
      'char telecommande fumee', 'excavatrice telecommandee metal',
      'drone camera enfant debutant', 'drone pliable gps camera',
      'drone course fpv debutant', 'helicoptere telecommande interieur',
      'briques de construction compatibles 1000 pieces', 'maquette bois a construire 3d',
      'puzzle 1000 pieces adulte', 'circuit voiture piste lumineuse',
      'train electrique circuit enfant', 'jeu de construction magnetique grand format',
      'etabli bricolage enfant outils', 'chevalet tableau enfant double face',
      'figurine anime collection 30cm', 'figurine manga resine grande taille',
      'figurine articulee action 20cm', 'figurine dessin anime lumineuse',
      'statuette anime socle collection', 'vitrine presentation figurines',
      'trampoline enfant jardin filet', 'cage de but football enfant',
      'panier de basket reglable enfant', 'table de ping pong pliante',
      'baby foot table enfant', 'flechettes electroniques cible',
      'piscine a balles enfant parc', 'toboggan enfant jardin plastique',
      'balancoire portique enfant jardin', 'tente de jeu enfant tipi',
      'trottinette electrique enfant 100w', 'velo enfant 16 pouces stabilisateurs',
      'draisienne bois enfant', 'skateboard enfant debutant',
      'rollers reglables enfant', 'overboard tout terrain enfant',
      'console retro portable enfant', 'console de jeux portable 10000 jeux',
      'manette sans fil compatible pc', 'tablette enfant educative etui',
      'tablette dessin lcd enfant', 'casque gaming enfant micro',
      'poupee mannequin articulee vetements', 'poupee princesse robe lumineuse',
      'maison de poupee meublee grande', 'poussette poupee jouet enfant',
      'poupon interactif bebe jouet', 'coffret maquillage enfant lavable',
      'cuisine enfant jouet accessoires', 'dinette enfant service complet',
      'caisse enregistreuse jouet enfant', 'deguisement princesse enfant robe',
    ],
    keywords: ['voiture electrique', 'quad electrique', 'moto electrique', 'buggy', 'tracteur', 'porteur', 'kart', 'batterie 12v', 'chargeur voiture', 'telecommandee', 'telecommande', 'rc', 'drift', 'excavatrice', 'bateau', 'char', 'drone', 'helicoptere', 'brique de construction', 'briques', 'maquette', 'puzzle', 'circuit', 'train electrique', 'magnetique', 'etabli', 'chevalet', 'figurine', 'statuette', 'vitrine', 'anime', 'manga', 'trampoline', 'cage de but', 'panier de basket', 'ping pong', 'baby foot', 'flechettes', 'piscine a balles', 'toboggan', 'balancoire', 'tipi', 'trottinette', 'velo enfant', 'draisienne', 'skateboard', 'rollers', 'overboard', 'console', 'manette', 'tablette enfant', 'tablette dessin', 'casque gaming', 'poupee', 'poupon', 'maison de poupee', 'poussette poupee', 'maquillage enfant', 'cuisine enfant', 'dinette', 'caisse enregistreuse', 'deguisement', 'jouet'],
  },
  {
    slug: 'bureau-teletravail',
    nameFr: 'Multimédia',
    emoji: '📺',
    universe: 'coworking',
    sortOrder: 290,
    // Second audit : une attelle, une barre de douche et un support de batterie électronique.
    exclude: ['attelle', 'douche', 'tambour'],
    searchTerms: ['televiseur led 32 pouces', 'smart tv 43 pouces', 'support tv mural orientable', 'barre de son tv bluetooth', 'console retro jeux integres', 'console portable retro', 'manette console sans fil', 'volant gaming pc console', 'mini pc bureau windows', 'ordinateur portable etudiant', 'clavier souris sans fil', 'ecran pc 24 pouces', 'ecran gaming 144hz', 'support ecran double bras', 'tablette android 10 pouces', 'tablette dessin graphique', 'smartphone android debloque', 'coque protection smartphone', 'videoprojecteur home cinema', 'ecran projection motorise', 'chaine hifi bluetooth', 'amplificateur audio hifi', 'enceinte colonne salon', 'casque realite virtuelle vr', 'imprimante 3d debutant', 'filament impression 3d', 'clavier piano numerique', 'pad batterie electronique', 'autoradio bluetooth ecran', 'camera embarquee voiture',
      // -- Ajout 22/09 : familles absentes du rayon --
      'routeur wifi 6 maison', 'repeteur wifi prise', 'switch reseau 5 ports', 'cable ethernet cat 6', 'disque dur externe 2 to', 'ssd externe usb c', 'cle usb 128 go', 'hub usb c multiport', 'dock station ordinateur portable', 'webcam full hd usb', 'micro usb streaming', 'casque micro bureau visio', 'lampe ecran barre moniteur', 'support ordinateur portable reglable', 'repose pieds bureau ergonomique', 'tapis souris xxl bureau', 'bras articule micro bureau', 'chargeur usb c multi ports', 'onduleur ordinateur bureau', 'parasurtenseur multiprise bureau', 'passe cable bureau organiseur', 'station recharge manettes console', 'grip manette antiderapant', 'housse console portable', 'carte memoire console extension', 'support casque gaming bureau', 'ampoule connectee wifi', 'prise connectee wifi', 'enceinte connectee wifi', 'camera surveillance wifi interieur',
    ],
    keywords: ['televiseur', 'tv', 'smart tv', 'console', 'manette', 'volant', 'pc', 'ordinateur', 'clavier', 'souris', 'ecran', 'moniteur', 'tablette', 'smartphone', 'telephone', 'coque', 'videoprojecteur', 'projection', 'projecteur', 'hifi', 'amplificateur', 'enceinte', 'casque', 'realite virtuelle', 'imprimante 3d', 'filament', 'piano', 'batterie', 'autoradio', 'camera', 'support', 'barre de son', 'gaming', 'audio', 'routeur', 'wifi', 'repeteur', 'switch', 'reseau', 'ethernet', 'disque dur', 'ssd', 'cle usb', 'hub', 'dock', 'webcam', 'micro', 'visio', 'repose pieds', 'onduleur', 'parasurtenseur', 'multiprise', 'passe cable', 'grip', 'carte memoire', 'connectee', 'prise', 'surveillance', 'extension', 'chargeur usb'],
  },
  {
    slug: 'loisirs-creatifs',
    nameFr: 'Loisirs créatifs',
    emoji: '🎨',
    sortOrder: 300,
    searchTerms: ['toile vierge chassis 20x20', 'toile vierge chassis 30x30', 'toile vierge chassis 40x50', 'toile peinture 50x70', 'lot petites toiles peinture', 'toile ronde peinture', 'toile coeur peinture', 'toile noire acrylique', 'toiles pastel colorees', 'panneau bois vierge peindre', 'coffret chevalet toiles', 'chevalet table peinture', 'carnet dessin sketchbook', 'bloc aquarelle papier', 'papier acrylique special', 'papier dessin grain', 'miroir a decorer diy', 'tote bag vierge personnaliser', 'pochoir peinture reutilisable', 'peinture acrylique set', 'pinceaux peinture acrylique', 'set aquarelle professionnel', 'marqueurs alcool dessin', 'crayons couleur professionnels', 'peinture par numero adulte', 'diamond painting kit', 'argile polymere modelage', 'kit crochet debutant', 'perles rocaille bijoux', 'tampons encreurs scrapbooking',
      // -- Ajout 22/09 : familles absentes du rayon --
      'machine a coudre debutant', 'kit couture accessoires', 'fil a coudre assortiment bobines', 'tissu coton coupon patchwork', 'ciseaux couture cranteurs', 'metre ruban couture', 'epingles couture boite', 'laine a tricoter pelote', 'aiguilles tricot circulaires', 'metier a tricoter rond', 'kit macrame corde', 'fil macrame coton naturel', 'moule resine epoxy bijoux', 'resine epoxy kit bijoux', 'pigments resine mica', 'moule bougie silicone diy', 'meches bougie coton lot', 'cire de soja bougie diy', 'pinces bijoux fait main', 'fermoirs bijoux assortiment', 'fil nylon bijoux perles', 'plioir papier origami', 'papier origami motifs lot', 'massicot papier scrapbooking', 'perforatrices papier formes', 'machine decoupe papier', 'tapis de decoupe loisirs creatifs', 'regle metal coupe papier', 'boite rangement perles compartiments', 'chariot rangement loisirs creatifs',
    ],
    keywords: ['toile', 'chassis', 'peinture', 'peindre', 'panneau', 'chevalet', 'carnet', 'sketchbook', 'dessin', 'croquis', 'bloc', 'aquarelle', 'papier', 'miroir', 'tote bag', 'pochoir', 'pinceau', 'marqueur', 'crayon', 'acrylique', 'numero', 'diamond', 'argile', 'modelage', 'crochet', 'tricot', 'perle', 'tampon', 'scrapbooking', 'creatif', 'kit', 'coffret', 'set', 'lot', 'coudre', 'couture', 'fil', 'bobine', 'tissu', 'coupon', 'patchwork', 'cranteur', 'epingle', 'laine', 'pelote', 'aiguille', 'tricoter', 'metier', 'macrame', 'resine', 'epoxy', 'pigment', 'mica', 'meche', 'soja', 'fermoir', 'plioir', 'origami', 'massicot', 'perforatrice', 'decoupe', 'fait main', 'diy', 'bijoux'],
  },
  {
    slug: 'spa-massage',
    nameFr: 'Spa & massage',
    emoji: '💆',
    universe: 'spa',
    sortOrder: 310,
    // Second audit : des tables pour ordinateur et des masques en tissu lavable.
    exclude: ['ordinateur', 'tables rondes', 'tissu lavable'],
    searchTerms: ['appareil massage nuque epaules', 'coussin massant shiatsu chauffant', 'pistolet massage percussion pro', 'appareil massage pieds electrique', 'bain de pieds massant chauffant', 'machine massage jambes compression', 'ceinture massage abdominale electrique', 'appareil massage dos chaise', 'fauteuil massage portable pliable', 'matelas massant chauffant', 'appareil massage cervical traction', 'rouleau massage electrique vibrant', 'sauna facial vapeur visage', 'hammam facial appareil', 'appareil sauna infrarouge portable', 'couverture chauffante infrarouge', 'diffuseur huiles essentielles spa', 'humidificateur brumisateur ambiance', 'pierres chaudes massage kit', 'bougie massage parfumee', 'huile de massage relaxante', 'table massage pliante portable', 'ventouse massage silicone', 'gua sha pierre visage', 'peignoir microfibre spa', 'sels de bain relaxants',
      // -- Ajout 22/09 : familles absentes du rayon --
      'coussin baignoire nuque', 'plateau baignoire bambou', 'tapis de bain antiderapant', 'brosse seche corps naturelle', 'gant kessa exfoliant', 'loofah eponge naturelle', 'bouillotte noyaux cerises', 'coussin chauffant micro ondes', 'masque yeux gel froid', 'masque de sommeil soie', 'lampe coucher de soleil ambiance', 'machine bruit blanc sommeil', 'bougie bois meche craquante', 'galets parfumes diffusion', 'brumisateur usb bureau', 'drap housse table massage', 'serviettes spa coton lot', 'bandeau eponge spa', 'chaussons spa jetables', 'peignoir capuche femme', 'balle massage lacrosse', 'balle picots pieds', 'rouleau mousse recuperation', 'bande elastique etirement', 'sels d epsom detente', 'huile essentielle lavande', 'porte huiles essentielles rangement', 'fontaine zen interieur', 'encens baton support',
    ],
    keywords: ['massage', 'massant', 'appareil', 'machine', 'pistolet', 'coussin', 'fauteuil', 'matelas', 'rouleau', 'ceinture', 'sauna', 'hammam', 'vapeur', 'infrarouge', 'couverture', 'diffuseur', 'humidificateur', 'brumisateur', 'pierre', 'bougie', 'huile', 'table', 'ventouse', 'gua sha', 'peignoir', 'sel', 'bain', 'spa', 'relaxation', 'nuque', 'cervical', 'pied', 'baignoire', 'kessa', 'loofah', 'bouillotte', 'noyaux', 'micro ondes', 'masque de sommeil', 'coucher de soleil', 'bruit blanc', 'meche', 'galet', 'drap', 'picots', 'epsom', 'essentielle', 'lavande', 'porte', 'encens', 'recuperation', 'brosse seche', 'masque yeux', 'bande elastique', 'fontaine zen'],
  },
  {
    slug: 'cinema-maison',
    nameFr: 'Soirée cinéma',
    emoji: '🍿',
    universe: 'cinema',
    sortOrder: 320,
    // Second audit : un support de téléphone de douche.
    exclude: ['douche'],
    searchTerms: ['mini projecteur portable', 'videoprojecteur full hd maison', 'ecran de projection pliable', 'ecran projection trepied', 'machine a popcorn maison', 'machine barbe a papa', 'barre de son tv', 'enceinte home cinema 5.1', 'support tablette lit reglable', 'support telephone canape', 'lampe led ambiance tv', 'bandeau led retroeclairage tv', 'plaid canape polaire', 'plaid chauffant electrique', 'coussin de sol cinema', 'pouf geant salon', 'telecommande universelle tv', 'boitier android tv', 'lunettes anti lumiere bleue', 'casque tv sans fil', 'guirlande led salon', 'projecteur etoiles galaxie', 'boite rangement telecommande', 'plateau canape repas',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cable hdmi 4k tresse', 'repartiteur hdmi commutateur', 'support videoprojecteur plafond', 'trepied videoprojecteur reglable', 'passe cable mural salon', 'multiprise parafoudre salon', 'transmetteur bluetooth tv audio', 'recepteur audio bluetooth enceinte', 'enceinte bluetooth portable salon', 'caisson de basses actif', 'machine a hot dog maison', 'distributeur boissons fontaine', 'saladier popcorn geant', 'boites popcorn carton lot', 'plateau tv pliant repas', 'table d appoint canape', 'porte gobelet canape accoudoir', 'housse canape extensible', 'lampe lave decorative salon', 'projecteur lumiere aurore boreale', 'neon led decoratif mural', 'panneau led hexagonal mural', 'rangement dvd blu ray meuble', 'panier rangement salon tissu', 'lunettes 3d passives', 'ecran projection portable valise', 'toile projection exterieur jardin', 'amplificateur casque tv', 'telecommande projecteur rechange', 'sac transport videoprojecteur',
    ],
    keywords: ['projecteur', 'videoprojecteur', 'projection', 'ecran', 'popcorn', 'barbe a papa', 'son', 'enceinte', 'home cinema', 'support', 'tablette', 'lampe', 'bandeau', 'plaid', 'coussin', 'pouf', 'telecommande', 'boitier', 'lunette', 'casque', 'cinema', 'guirlande', 'etoile', 'galaxie', 'boite', 'plateau', 'canape', 'led', 'machine', 'tv', 'hdmi', 'repartiteur', 'commutateur', 'plafond', 'passe cable', 'multiprise', 'parafoudre', 'transmetteur', 'recepteur', 'bluetooth', 'caisson', 'basse', 'hot dog', 'saladier', 'carton', 'appoint', 'porte gobelet', 'accoudoir', 'extensible', 'lave', 'aurore', 'neon', 'hexagonal', 'dvd', 'blu ray', '3d', 'amplificateur', 'decoratif', 'meuble', 'distributeur boissons', 'panier rangement'],
  },
  {
    slug: 'cake-design',
    nameFr: 'Pâtisserie & cake design',
    emoji: '🧁',
    universe: 'bakery',
    sortOrder: 330,
    // Refusés ici : le premier audit y a trouvé des rouleaux de plâtrier et de peintre, entrés par « rouleau ».
    // Second audit : une brosse à cheveux, une poudre à ongles, un lisseur de fil d'acier.
    exclude: ['platre', 'platrage', 'mastic', 'reboucher', 'enduit', 'peinture decorative', 'cheveux', 'ongle', 'fil en acier', 'electrolux'],
    searchTerms: ['moule silicone patisserie', 'moule gateau anniversaire', 'poche a douille set', 'douilles inox patisserie', 'colorant alimentaire gel', 'colorant poudre alimentaire', 'tapis silicone patisserie', 'tapis mesure patisserie', 'emporte piece patisserie', 'emporte piece biscuits set', 'plateau tournant gateau', 'plateau presentation gateau', 'spatule lissante gateau', 'lisseur pate a sucre', 'thermometre sucre cuisson', 'thermometre four numerique', 'caissettes cupcake papier', 'support cupcakes presentoir', 'decoration comestible gateau', 'perles sucre decoration', 'rouleau texture pate a sucre', 'rouleau patisserie ajustable', 'boite transport gateau', 'carton support gateau', 'pistolet decoration gateau', 'set modelage pate a sucre', 'tapis dentelle sucre', 'pochoir decoration gateau',
      // -- Ajout 22/09 : familles absentes du rayon --
      'cercle a patisserie reglable', 'cadre patisserie inox', 'grille refroidissement patisserie', 'tapis macarons silicone', 'moule madeleine silicone', 'moule tarte cannele', 'chinois tamis patisserie', 'tamis farine manuel', 'corne patissiere plastique', 'maryse patisserie silicone', 'fouet electrique patisserie', 'batteur oeufs manuel', 'siphon chantilly inox', 'poche a douille jetable lot', 'moule chocolat polycarbonate', 'moule bonbons silicone', 'fourchette trempage chocolat', 'feuille transfert chocolat', 'bougies anniversaire gateau', 'bougie chiffre gateau', 'topper gateau anniversaire', 'cloche a gateau transparente', 'boite macarons transport', 'sachets patisserie biscuits', 'pinceau patisserie silicone', 'rouleau a patisserie bois', 'moule a cake antiadhesif', 'papier cuisson precoupe', 'stylo alimentaire decoration', 'paillettes comestibles decoration',
    ],
    keywords: ['patisserie', 'gateau', 'moule', 'douille', 'poche a douille', 'colorant', 'tapis', 'emporte', 'plateau', 'spatule', 'lisseur', 'thermometre', 'caissette', 'cupcake', 'decoration', 'pate a sucre', 'rouleau', 'boite', 'silicone', 'cuisson', 'presentoir', 'perle', 'carton', 'pistolet', 'modelage', 'dentelle', 'pochoir', 'support', 'set', 'cercle', 'refroidissement', 'macaron', 'madeleine', 'tarte', 'cannele', 'chinois', 'tamis', 'farine', 'corne', 'maryse', 'batteur', 'siphon', 'chantilly', 'chocolat', 'polycarbonate', 'bonbon', 'fourchette', 'trempage', 'feuille', 'transfert', 'anniversaire', 'topper', 'cloche', 'sachet', 'biscuit', 'cake', 'comestible'],
  },
  {
    slug: 'fete-decoration',
    nameFr: 'Fêtes & décoration',
    emoji: '🎉',
    universe: 'event_venue',
    sortOrder: 340,
    // Couvre les grandes occasions de l'annee : anniversaire, mariage, EVJF,
    // Halloween, Noel, Nouvel An, Saint-Valentin, Paques, baby shower, bapteme,
    // communion, remise de diplome, fete des meres et des peres, carnaval,
    // Ramadan et Aid. Le decor commun (ballons, guirlandes, photobooth, art de
    // la table) se vend toute l'annee et porte le rayon entre deux saisons.
    // Second audit : une table à manger.
    exclude: ['table a manger'],
    searchTerms: [
      // -- Termes d'origine --
      'arche de ballons anniversaire', 'ballon chiffre geant', 'pompe a ballon electrique', 'support arche ballon', 'guirlande lumineuse led interieur', 'guirlande fanion decoration', 'rideau de franges metallise', 'lettre lumineuse led', 'canon a confettis', 'lampion papier decoration', 'nappe jetable decoration', 'chemin de table paillette', 'centre de table mariage', 'sac cadeau invite fete', 'serpentin cotillon fete', 'accessoire photobooth mariage', 'cadre photobooth', 'photocall anniversaire', 'banniere joyeux anniversaire', 'bougie anniversaire chiffre', 'pinata anniversaire', 'decoration mariage table', 'ballon mariage just married', 'accessoire evjf enterrement vie jeune fille', 'decoration halloween interieur', 'toile araignee halloween', 'citrouille led decoration', 'serre-tete deguisement fete', 'decoration noel sapin', 'guirlande noel led', 'couronne de porte noel', 'boule de noel lot', 'calendrier de l avent a remplir', 'set de table noel', 'decoration nouvel an reveillon', 'lunettes nouvel an fete', 'decoration saint valentin coeur', 'ballon coeur saint valentin', 'boite cadeau saint valentin', 'decoration paques oeufs', 'panier de paques decoration', 'decoration baby shower', 'ballon gender reveal', 'decoration bapteme dragees', 'boite a dragees bapteme', 'decoration communion', 'decoration remise de diplome', 'ballon felicitations diplome', 'decoration fete des meres', 'cadeau fete des peres decoration', 'decoration carnaval masque', 'masque venitien carnaval', 'decoration ramadan aid', 'guirlande eid mubarak', 'lanterne ramadan decoration',
      // -- Ajout 21/09 : Noel, Halloween, anniversaires, mariage --
      'mini sapin de noel artificiel', 'ornement suspension sapin noel', 'boule de noel design originale', 'centre de table noel decoration', 'nappe de noel decoration', 'chemin de table noel', 'chaussette de noel decoration', 'sticker vitre noel decoration', 'papier cadeau motif noel', 'sac cadeau noel decoration', 'ruban cadeau noel', 'noeud decoratif cadeau', 'bonnet pere noel accessoire', 'echarpe pere noel decoration', 'rideau lumineux noel', 'projecteur laser noel exterieur', 'accessoire photobooth noel', 'decoration noel personnalisee prenom', 'citrouille decorative halloween', 'squelette decoratif halloween', 'decoration porte halloween', 'guirlande halloween decoration', 'ballon halloween decoration', 'bougie led halloween', 'decoration table halloween', 'vaisselle jetable halloween', 'gobelet assiette halloween', 'accessoire deguisement halloween', 'masque halloween decoration', 'chapeau sorciere halloween', 'accessoire photobooth halloween', 'decoration jardin halloween exterieur', 'kit decoration anniversaire complet', 'ballon lettre geant anniversaire', 'vaisselle jetable anniversaire', 'bougie anniversaire forme originale', 'banniere anniversaire chiffre age', 'decoration anniversaire enfant theme', 'decoration anniversaire adulte theme', 'nappe mariage decoration', 'serviette de table mariage', 'bougie led mariage decoration', 'housse de chaise mariage', 'noeud de chaise mariage', 'arche de mariage decoration', 'decoration salle mariage', 'livre d or mariage', 'boite a alliances mariage', 'panneau signaletique mariage', 'accessoire evg enterrement vie garcon',
    ],
    keywords: ['ballon', 'guirlande', 'fanion', 'banniere', 'photobooth', 'photocall', 'confetti', 'serpentin', 'cotillon', 'bougie', 'lampion', 'lanterne', 'nappe', 'chemin de table', 'centre de table', 'set de table', 'sac cadeau', 'boite cadeau', 'arche', 'frange', 'lettre lumineuse', 'lumineuse', 'paillette', 'decoration', 'deco', 'anniversaire', 'pinata', 'mariage', 'just married', 'evjf', 'fiancaille', 'halloween', 'citrouille', 'araignee', 'deguisement', 'serre-tete', 'noel', 'sapin', 'couronne', 'avent', 'nouvel an', 'reveillon', 'saint valentin', 'paques', 'baby shower', 'gender reveal', 'bapteme', 'dragee', 'communion', 'diplome', 'felicitations', 'fete', 'carnaval', 'venitien', 'ramadan', 'aid', 'eid', 'mini sapin', 'ornement', 'suspension', 'papier cadeau', 'noeud', 'echarpe', 'rideau lumineux', 'laser', 'projecteur', 'personnalise', 'squelette', 'vaisselle', 'jetable', 'gobelet', 'assiette', 'chapeau', 'sorciere', 'jardin', 'kit', 'chiffre', 'age', 'housse', 'alliance', 'signaletique', 'panneau', 'evg', 'livre d or', 'chaussette', 'sticker', 'vitre'],
  },
  {
    slug: 'ski-hiver',
    nameFr: 'Ski & sports d\'hiver',
    emoji: '🎿',
    sortOrder: 350,
    // Accessoires uniquement. Skis, snowboards et chaussures sont volumineux
    // à expédier et se choisissent à la pointure : en importation lointaine,
    // c'est la garantie d'un taux de retour qui mange la marge.
    // Refusés ici : le premier audit y a trouvé des masques de protection anti-gouttelettes, entrés par « masque ».
    // Second audit : des housses de siège de voiture et de coffre.
    exclude: ['gouttelette', 'eclaboussure', 'siege avant', 'siege de coffre', 'doublure de chargement'],
    searchTerms: ['masque de ski antibuee', 'masque snowboard photochromique', 'gant de ski chauffant', 'gant snowboard impermeable', 'sous-gant thermique ski', 'chaussette de ski thermique', 'cagoule ski polaire', 'tour de cou thermique', 'bonnet ski polaire', 'chaufferette main rechargeable', 'chaufferette jetable hiver', 'casque de ski adulte', 'protection dorsale snowboard', 'housse a ski transport', 'sangle porte-ski', 'sac a dos ski randonnee', 'lunette glacier montagne', 'sous-vetement thermique ski', 'crampon chaussure neige', 'guetre neige randonnee', 'raquette a neige adulte', 'baton de ski telescopique', 'sechoir chaussure de ski', 'fart ski entretien', 'antivol ski cadenas', 'genouillere protection ski',
      // -- Ajout 22/09 : familles absentes du rayon --
      'luge enfant plastique neige', 'bouee des neiges gonflable', 'pelle a neige pliante voiture', 'balai a neige grattoir voiture', 'chaine neige pneu hiver', 'semelle chauffante hiver', 'chaussette chauffante rechargeable', 'plaid polaire chalet', 'bouillotte rechargeable hiver', 'thermos isotherme montagne', 'gourde isotherme sport hiver', 'etui rigide masque de ski', 'lingette antibuee masque', 'sangle masque de ski rechange', 'sac chaussures de ski', 'housse casque de ski', 'peaux de phoque ski randonnee', 'protege lame patin a glace', 'patins a glace ajustables', 'masque de ski enfant', 'gant ski enfant impermeable', 'moufle ski impermeable', 'echarpe polaire hiver', 'bandeau cache oreilles hiver', 'pantalon impermeable neige', 'support sechage gants ski', 'brosse fart semelle ski', 'sangle rangement batons ski',
    ],
    keywords: ['ski', 'snowboard', 'neige', 'montagne', 'antibuee', 'photochromique', 'masque', 'gant', 'sous-gant', 'chaussette', 'cagoule', 'tour de cou', 'bonnet', 'thermique', 'polaire', 'chaufferette', 'chauffe-main', 'casque', 'dorsale', 'genouillere', 'housse', 'porte-ski', 'glacier', 'sous-vetement', 'crampon', 'guetre', 'raquette a neige', 'baton', 'sechoir', 'fart', 'hiver', 'impermeable', 'luge', 'bouee', 'balai', 'grattoir', 'semelle', 'bouillotte', 'thermos', 'gourde', 'patin', 'moufle', 'echarpe', 'pantalon', 'peaux de phoque'],
  },
  {
    slug: 'peche',
    nameFr: 'Pêche',
    emoji: '🎣',
    sortOrder: 360,
    searchTerms: ['leurre souple carnassier', 'leurre dur poisson nageur', 'leurre cuillere tournante', 'popper leurre surface', 'moulinet spinning peche', 'moulinet casting peche', 'canne a peche telescopique', 'canne spinning carbone', 'fil de peche tresse', 'fil nylon peche bobine', 'hamecon peche lot', 'tete plombee jig', 'bas de ligne acier', 'emerillon agrafe peche', 'flotteur peche reglable', 'boite a leurre rangement', 'epuisette peche pliante', 'pince a peche inox', 'ciseaux tresse peche', 'gilet de peche multipoche', 'porte-canne support peche', 'detecteur de touche peche', 'lampe frontale peche nuit', 'sac de peche etanche', 'peson balance peche', 'amorce peche carpe',
      // -- Ajout 22/09 : familles absentes du rayon --
      'siege de peche pliant', 'panier siege peche', 'waders peche respirant', 'bottes de peche caoutchouc', 'lunettes polarisantes peche', 'casquette peche anti uv', 'rod pod carpe support', 'tapis de reception carpe', 'bouillettes carpe appat', 'aiguille a bouillette', 'montage cheveu carpe', 'canne a mouche peche', 'mouche artificielle lot', 'boite a mouches rangement', 'degorgeoir peche poisson', 'pince coupante tresse peche', 'sondeur portable peche', 'echosondeur peche sans fil', 'metre ruban mesure poisson', 'tete epuisette rechange', 'valise rangement peche', 'sac a dos peche materiel', 'canne a peche enfant', 'kit peche debutant complet', 'plomb peche assortiment', 'bouchon peche coulissant', 'seau a vif peche', 'bourriche peche filet', 'parapluie peche abri', 'piquet support canne sol',
    ],
    keywords: ['canne a peche', 'fil de peche', 'materiel de peche', 'peche a la ligne', 'pince a peche', 'gilet de peche', 'sac de peche', 'lampe frontale', 'pecheur', 'leurre', 'moulinet', 'spinning', 'casting', 'hamecon', 'tresse', 'nylon', 'flotteur', 'emerillon', 'epuisette', 'carnassier', 'brochet', 'truite', 'carpe', 'silure', 'sandre', 'jig', 'popper', 'cuillere tournante', 'plombee', 'bas de ligne', 'peson', 'porte-canne', 'detecteur de touche', 'appat', 'amorce', 'waders', 'bottes', 'lunettes', 'casquette', 'rod pod', 'bouillette', 'aiguille', 'montage', 'mouche', 'degorgeoir', 'sondeur', 'echosondeur', 'sac a dos', 'plomb', 'bouchon', 'bourriche', 'piquet', 'siege de peche', 'panier siege', 'metre ruban', 'valise rangement', 'kit peche', 'seau a vif', 'parapluie peche'],
  },
  {
    slug: 'bebe-puericulture',
    nameFr: 'Bébé & puériculture',
    emoji: '👶',
    sortOrder: 370,
    // Un accessoire de rangement, un tapis de bain ou une trousse de toilette
    // n'entre ici que s'il s'adresse vraiment à un enfant : sans cette
    // exigence, le premier import a ramené des couches pour chien, des
    // organisateurs de coffre de voiture et une robe de chambre pour femme.
    requireContext: ['bebe', 'enfant', 'nourrisson', 'nouveau-ne', 'tout-petit', 'bambin', 'puericulture', 'maternite', 'layette', 'naissance', 'berceau', 'poussette', 'landau', 'grossesse', 'allaitement', 'langer', 'bavoir', 'couche', 'creche', 'gigoteuse', 'gigoteuses'],
    // Refusés quoi que dise le reste du titre (cf. le commentaire ci-dessous).
    // Un coffret « soins bébé » contenant une attache-tétine est passé au
    // premier import : le produit principal était hors de cause, l'accessoire
    // non — d'où un refus sur le mot, et non sur l'objet vendu.
    exclude: ['biberon', 'tetine', 'attache-tetine', 'sucette', 'dentition', 'siege auto', 'chaise haute', 'porte-bebe', 'lit parapluie', 'tour de lit', 'transat', 'trotteur', 'youpala', 'rehausseur', 'cosy', 'nacelle', 'chien', 'chiot', 'chat', 'chaton', 'animaux de compagnie', 'animal de compagnie'],
    /**
     * Rayon volontairement limité aux articles NON réglementés.
     *
     * Depuis le règlement (UE) 2023/988, applicable au 13 décembre 2024,
     * celui qui met sur le marché européen un produit venu de hors UE en
     * répond comme importateur. En dropshipping, c'est nous — pas le vendeur,
     * qui ne fournira aucune déclaration de conformité.
     *
     * Sont donc exclus, et ne doivent pas être ajoutés ici :
     *  - biberons, tétines, anneaux de dentition (contact alimentaire, EN 14350) ;
     *  - poussettes, porte-bébés, lits et barrières (EN 1888, EN 716) ;
     *  - sièges auto (homologation R129 — un siège non homologué engage notre
     *    responsabilité en cas d'accident) ;
     *  - jouets et tapis d'éveil (marquage CE, EN 71, pièces détachables).
     *
     * `keywords` ne contient volontairement ni « bébé » ni « poussette » :
     * trop larges, ils laissaient passer exactement ce que cette liste écarte
     * — un essai sur des titres réels a vu « Poussette canne pliable » entrer
     * par le second. Les accessoires de poussette (organisateur, chancelière,
     * ombrelle, moustiquaire) sont reconnus par leur propre nom.
     */
    searchTerms: ['bavoir bebe impermeable', 'bavoir silicone recuperateur', 'sac a langer sac a dos', 'matelas a langer nomade', 'tapis a langer pliable', 'organisateur poussette rangement', 'sac rangement poussette', 'cape de bain bebe', 'sortie de bain capuche bebe', 'gigoteuse bebe coton', 'veilleuse bebe led', 'veilleuse projecteur etoile', 'thermometre de bain bebe', 'baignoire bebe pliable', 'siege de bain antiderapant', 'humidificateur chambre bebe', 'poubelle a couche', 'panier rangement chambre bebe', 'coussin allaitement grossesse', 'chanceliere poussette hiver', 'ombrelle poussette uv', 'moustiquaire poussette', 'protege-carnet de sante', 'sac a jouet rangement', 'porte-serviette chambre enfant', 'protege matelas bebe impermeable', 'drap housse lit bebe coton', 'kit soin bebe coupe-ongles', 'brosse et peigne bebe', 'trousse de toilette bebe', 'sac a dos maternite', 'range-couche table a langer', 'boite de rangement jouet enfant', 'sac rangement vetement bebe', 'cintre bebe lot rangement', 'marche pied enfant salle de bain', 'reducteur de toilette enfant', 'tapis de bain antiderapant enfant', 'thermometre chambre bebe', 'moufle anti griffure bebe', 'toise murale enfant chambre', 'sticker mural chambre bebe', 'guirlande decorative chambre bebe', 'cadre empreinte bebe souvenir', 'album photo naissance bebe', 'boite a souvenirs naissance', 'panier a linge enfant chambre', 'porte-manteau mural chambre enfant', 'separateur de tiroir vetement bebe', 'bandeau cheveux bebe naissance', 'chausson bebe antiderapant coton', 'sac piscine enfant impermeable',
      // -- Ajout 22/09 : familles absentes du rayon --
      'assiette compartiment enfant silicone', 'couverts enfant ergonomiques', 'gobelet paille enfant anti fuite', 'set repas enfant silicone', 'bavoir manches enfant peinture', 'tapis repas sol enfant', 'serviette de table enfant elastique', 'sac isotherme repas enfant', 'gant de toilette bebe coton lot', 'peignoir capuche enfant coton', 'filet rangement bain enfant', 'pichet rincage cheveux bebe', 'visiere shampoing enfant', 'brosse a dents enfant souple', 'sablier brossage dents enfant', 'marchepied toilette enfant antiderapant', 'body bebe coton manches longues', 'pyjama bebe coton naissance', 'chaussettes antiderapantes enfant lot', 'bonnet naissance bebe coton', 'legging bebe coton naissance', 'couverture bebe coton naissance', 'lange coton bebe lot', 'serviette a capuche bebe brodee', 'boite a dents de lait enfant', 'carnet de naissance souvenir bebe', 'projecteur veilleuse musical chambre bebe', 'machine bruit blanc bebe sommeil', 'rangement mural chambre enfant pochettes', 'coffre a jouets enfant pliable',
    ],
    keywords: ['bavoir', 'langer', 'gigoteuse', 'veilleuse', 'baignoire', 'thermometre de bain', 'humidificateur', 'couche', 'allaitement', 'chanceliere', 'ombrelle', 'moustiquaire', 'cape de bain', 'sortie de bain', 'siege de bain', 'protege-carnet', 'panier', 'rangement', 'organisateur', 'chambre', 'berceuse', 'nurserie', 'puericulture', 'protege matelas', 'drap housse', 'coupe-ongles', 'peigne', 'trousse', 'maternite', 'cintre', 'marche pied', 'reducteur de toilette', 'tapis de bain', 'moufle', 'toise', 'sticker', 'guirlande', 'cadre', 'album', 'souvenir', 'linge', 'porte-manteau', 'separateur', 'bandeau', 'chausson', 'piscine', 'couverts', 'isotherme', 'gant de toilette', 'rincage', 'visiere', 'brosse a dents', 'sablier', 'marchepied', 'body', 'pyjama', 'legging', 'lange', 'dents de lait', 'musical', 'bruit blanc', 'assiette compartiment', 'gobelet paille', 'set repas', 'tapis repas', 'serviette de table', 'peignoir capuche', 'chaussettes antiderapantes', 'bonnet naissance', 'couverture bebe', 'serviette a capuche', 'coffre a jouets'],
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
  // Marques de mode (sacs, lunettes, ceintures) — ajoutees a la creation du
  // rayon Mode & accessoires plutot qu'apres un audit qui les trouverait.
  'ray-ban', 'rayban', 'michael kors', 'coach', 'fendi', 'burberry', 'versace',
  'saint laurent', 'ysl', 'celine', 'givenchy', 'valentino', 'chloe',
  'tommy hilfiger', 'calvin klein', 'ralph lauren', 'lacoste',
  // Matériel réglementé / sensible
  'aiguille tatouage', 'aiguilles tatouage', 'dermographe', 'machine a tatouer',
  'encre de tatouage', 'kit de percage', 'pistolet a percer', 'lentille de contact',
  'medicament', 'complement alimentaire', 'e-cigarette', 'cigarette electronique',
  'arme', 'couteau papillon', 'taser', 'laser pointeur',
  // Contenu pour adultes. L'inscription est réservée aux 16 ans et plus, et
  // rien de ceci n'a sa place dans une boutique généraliste : un lubrifiant
  // « érotique » est entré dans Spa & massage par le seul mot « massage ».
  // « lubrifiant » seul n'y figure pas — celui d'une chaîne de vélo est légitime.
  'erotique', 'lubrifiant intime', 'lubrifiant corporel', 'sextoy', 'sex toy',
  'vibromasseur', 'godemiche', 'masturbateur', 'plug anal', 'bdsm',
  // Engins motorisés : un quad électrique 60 V « pour adultes et enfants » est
  // entré dans Vélo & mobilité. « quad » seul n'y figure pas : il désigne
  // aussi les processeurs « quad core » des tablettes.
  //
  // Ce qui est interdit, c'est le thermique et la tension : un porteur
  // électrique 12 V pour enfant est un jouet ordinaire, et le rayon Jouets le
  // cherche. 60 V et 72 V ne correspondent en revanche à aucun produit de
  // cette boutique — ni jouet, ni vélo, où le grand public s'arrête à 48 V.
  'quad tout-terrain', 'pocket bike', 'moto thermique', 'quad thermique',
  'mini moto thermique', 'moto cross thermique', '60v', '72v',
  // Armes blanches. Une épée chinoise « lame en acier au manganèse » est
  // entrée dans Bijoux & montres par le mot « acier ». « épée » seul n'est pas
  // interdit : une épée en mousse reste un jouet.
  'katana', 'machette', 'poignard', 'dague', 'poing americain', 'matraque',
  // Tabac : une machine à rouler est entrée dans Soirée & karaoké.
  'machine a rouler', 'tubeuse', 'feuille a rouler', 'feuilles a rouler', 'papier a rouler', 'bong',
  // Dispositifs médicaux (règlement (UE) 2017/745) : les distribuer suppose
  // des obligations que la boutique ne remplit pas. Trouvés : un nébuliseur,
  // une unité TENS, un plateau d'instruments chirurgicaux. « attelle » n'y
  // figure pas : une genouillère de sport en porte parfois le nom.
  'nebuliseur', 'unite tens', 'electrostimulation', 'stimulateur musculaire',
  'oxymetre', 'tensiometre', 'instruments chirurgicaux',
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
export function containsTerm(normalizedTitle: string, term: string): boolean {
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
 * Le titre porte-t-il le contexte exigé par le rayon ?
 *
 * Vrai d'office quand le rayon n'en exige aucun — c'est le cas de tous sauf
 * un aujourd'hui.
 */
export function matchesContext(title: string, context?: string[]): boolean {
  if (!context || context.length === 0) return true;
  const t = normalize(title);
  return context.some((c) => containsTerm(t, c));
}

/** Le titre nomme-t-il un article que ce rayon refuse par principe ? */
export function isExcluded(title: string, exclude?: string[]): boolean {
  if (!exclude || exclude.length === 0) return false;
  const t = normalize(title);
  return exclude.some((e) => containsTerm(t, e));
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
