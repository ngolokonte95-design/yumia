/**
 * Cohérence des résultats de l'écran des visites.
 *
 * La recherche plein texte de Viator ORDONNE les offres par ressemblance avec
 * le terme, elle ne les filtre pas : « théâtre » remonte aussi une croisière
 * qui passe devant l'Opéra, « plongée » une visite « en plongée dans
 * l'histoire ». On garde donc une offre seulement si son TITRE contient l'un
 * des mots qui caractérisent vraiment le thème ou le filtre choisi.
 *
 * Mots en français ET en anglais : tous les produits Viator ne sont pas
 * traduits. Comparaison sans accents ni casse, par mot entier au pluriel ou
 * féminin près (« vélo » reconnaît « vélos », « privé » « privée », mais « bar »
 * ne reconnaît pas « Barcelone »). Un mot terminé par `*` est une racine :
 * « gastronom* » reconnaît « gastronomie » comme « gastronomique ».
 *
 * Un thème absent d'ici (Activités, Aventure, Visites guidées sans filtre) est
 * large par nature : aucun contrôle, tout résultat du thème est cohérent.
 */
export const THEME_MATCH: Record<string, string[]> = {
  skip_the_line: ['coupe-file', 'coupe file', 'sans attente', 'skip', 'prioritaire', 'billet', 'entree', 'ticket', 'admission', 'acces'],
  food_tours: ['degustation', 'gastronom*', 'culinaire', 'cuisine', 'food', 'repas', 'tasting', 'diner', 'dejeuner', 'vin', 'wine', 'fromage', 'cheese', 'chocolat*', 'marche', 'market', 'street'],
  hop_on_hop_off: ['bus', 'hop', 'arrets libres', 'tootbus', 'panoramique'],
  airport_transfer: ['transfert', 'transfer', 'aeroport', 'airport', 'navette', 'shuttle', 'chauffeur'],
  shows: ['spectacle', 'show', 'concert', 'cabaret', 'theatre', 'theater', 'comedie', 'comedy', 'soiree', 'croisiere', 'cruise', 'nuit', 'night', 'bar', 'pub', 'club', 'opera', 'ballet', 'danse', 'dance', 'musical', 'jazz', 'humour'],
};

export const FACET_MATCH: Record<string, Record<string, string[]>> = {
  guides: {
    walking: ['a pied', 'pied', 'walking', 'walk', 'marche', 'promenade', 'balade'],
    bike: ['velo', 'bike', 'bicycle', 'cycl*', 'vtt', 'e-bike'],
    boat: ['bateau', 'boat', 'croisiere', 'cruise', 'peniche', 'gondole', 'catamaran', 'voilier', 'navigation'],
    night: ['nuit', 'night', 'soir', 'soiree', 'evening', 'nocturne', 'illumin*'],
    private: ['prive', 'private', 'privat*'],
    mystery: ['insolite', 'mystere', 'mystery', 'fantome', 'ghost', 'hante', 'haunted', 'catacomb*', 'secret*', 'legende', 'legend', 'crime', 'sorcell*', 'vampire', 'macabre'],
    street_art: ['street art', 'graffiti', 'art urbain', 'fresque', 'mural*', 'tag'],
    photo: ['photo*', 'instagram*', 'shooting', 'selfie'],
  },
  adventure: {
    hiking: ['randonnee', 'rando', 'hiking', 'hike', 'trek*', 'sentier'],
    kayak: ['kayak', 'canoe', 'paddle', 'pagaie'],
    water_sports: ['kayak', 'paddle', 'plongee', 'snorkel*', 'jet ski', 'jet-ski', 'jetski', 'surf*', 'voile', 'sailing', 'diving', 'nautique', 'water sport', 'rafting', 'wakeboard', 'parachute ascensionnel', 'parasail', 'canoe'],
    paragliding: ['parapente', 'paragliding', 'paramoteur', 'deltaplane', 'hang glid*', 'parachute', 'skydiv*', 'parasail'],
    quad: ['quad', 'buggy', 'atv', 'motocross', 'moto'],
    climbing: ['escalade', 'climb*', 'via ferrata', 'grimpe', 'bloc', 'boulder*', 'canyoning'],
    horse: ['equitation', 'cheval', 'chevaux', 'horse*', 'equestre', 'poney', 'balade a cheval'],
    rafting: ['rafting', 'eaux vives', 'white water', 'whitewater', 'hydrospeed', 'canyoning'],
    snow: ['ski', 'neige', 'snow*', 'raquette*', 'luge', 'traineau', 'husky', 'glacier', 'station de ski'],
  },
  food_tours: {
    wine: ['vin', 'wine', 'vignoble', 'vineyard', 'winery', 'cave', 'cellar', 'oenolog*', 'champagne', 'sommelier', 'domaine', 'chateau'],
    cooking: ['cours de cuisine', 'cooking', 'cuisine', 'atelier', 'class', 'chef'],
    street_food: ['street', 'rue', 'food tour', 'snack', 'marche'],
    market: ['marche', 'market', 'halles', 'mercado', 'mercato'],
    chocolate: ['chocolat*', 'patisserie', 'pastry', 'macaron', 'croissant', 'dessert', 'patissier', 'praline'],
    cheese: ['fromage', 'cheese', 'fromager', 'fromagerie', 'fondue', 'raclette'],
    home_meal: ['chez l habitant', 'habitant*', 'local family', 'home cooked', 'home dinner', 'dinner with', 'fait maison', 'famille locale', 'eatwith', 'in a local home'],
    coffee: ['cafe', 'coffee', 'torrefaction', 'barista', 'espresso'],
  },
  activities: {
    family: ['famil*', 'family', 'enfant', 'kid', 'children', 'child', 'familial'],
    cruise: ['croisiere', 'cruise', 'bateau', 'boat', 'peniche', 'navigation'],
    day_trip: ['excursion', 'day trip', 'journee', 'full-day', 'full day', 'depuis', 'au depart de'],
    workshop: ['atelier', 'workshop', 'cours', 'class', 'masterclass', 'initiation'],
    museum: ['musee', 'museum', 'museo', 'galerie', 'gallery', 'louvre', 'orsay', 'exposition', 'exhibition'],
    spa: ['spa', 'hammam', 'massage*', 'bien etre', 'bain*', 'thermes', 'thermal*', 'wellness', 'onsen', 'sauna'],
    zoo: ['zoo', 'aquarium', 'safari', 'animal*', 'parc animalier', 'oceanarium', 'dauphin*', 'dolphin*', 'ferme'],
    theme_park: ['parc d attractions', 'theme park', 'amusement', 'disney*', 'parc asterix', 'universal', 'legoland', 'port aventura', 'portaventura', 'europa park', 'fete foraine', 'parc aquatique', 'water park'],
  },
  shows: {
    nightlife: ['boite', 'club', 'nightclub', 'discotheque', 'clubbing', 'vip', 'party', 'fete', 'soiree'],
    cabaret: ['cabaret', 'moulin rouge', 'lido', 'crazy horse', 'burlesque', 'revue', 'paradis latin'],
    concert: ['concert', 'musique', 'music', 'jazz', 'orchestre', 'orchestra', 'recital', 'opera', 'piano', 'live', 'quatuor', 'symphon*'],
    comedy: ['humour', 'comedy', 'comedie', 'stand-up', 'stand up', 'comique', 'impro', 'humoriste'],
    theatre: ['theatre', 'theater', 'piece de', 'comedie francaise', 'broadway', 'west end'],
    musical: ['comedie musicale', 'musical', 'broadway', 'west end'],
    dinner_cruise: ['croisiere', 'cruise', 'bateau', 'boat', 'peniche'],
    pub_crawl: ['bar', 'pub', 'crawl', 'tournee', 'cocktail', 'biere', 'beer', 'brasserie'],
    dance: ['danse', 'dance', 'flamenco', 'tango', 'ballet', 'salsa', 'danseur*'],
    opera: ['opera', 'lyrique', 'philharmoni*'],
  },
};

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Mots qu'un titre doit contenir pour ce thème/filtre, ou `null` s'il n'y a rien à contrôler. */
export function relevanceWords(theme: string, facet?: string): string[] | null {
  return (facet ? FACET_MATCH[theme]?.[facet] : undefined) ?? THEME_MATCH[theme] ?? null;
}

/**
 * Le titre contient-il l'un des mots ? Mot entier, à une terminaison de
 * pluriel ou de féminin près ; racine (mot terminé par `*`) en début de mot.
 */
export function titleMatches(title: string, words: string[]): boolean {
  const t = ` ${fold(title).replace(/[^a-z0-9]+/g, ' ')} `;
  return words.some((w) => {
    const stem = w.endsWith('*');
    const core = fold(stem ? w.slice(0, -1) : w).replace(/[^a-z0-9]+/g, ' ').trim();
    // `core` ne contient plus que [a-z0-9 ] : rien à échapper.
    return new RegExp(stem ? ` ${core}` : ` ${core}(s|x|e|es)? `).test(t);
  });
}

/**
 * Filtres pratiques, cumulables avec un style : ils portent sur les données
 * chiffrées de Viator, pas sur les titres — donc fiables, sans liste de mots.
 */
export const QUICK_FILTERS = ['budget', 'short', 'top', 'free_cancel'] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number];

export function isQuickFilter(v: string): v is QuickFilter {
  return (QUICK_FILTERS as readonly string[]).includes(v);
}

/** Plafond « Petit budget », par personne. */
export const BUDGET_MAX_EUR = 30;
/** « Moins de 2 h ». */
export const SHORT_MAX_MINUTES = 120;
/** « Très bien noté » : note minimale, et assez d'avis pour qu'elle ait un sens. */
export const TOP_MIN_RATING = 4.5;
export const TOP_MIN_REVIEWS = 100;

export function passesQuickFilters(
  tour: { fromPrice: number | null; durationMinutes: number | null; rating: number | null; reviewCount: number; freeCancellation: boolean | null },
  quick: readonly QuickFilter[],
): boolean {
  return quick.every((q) => {
    switch (q) {
      case 'budget': return tour.fromPrice != null && tour.fromPrice <= BUDGET_MAX_EUR;
      case 'short': return tour.durationMinutes != null && tour.durationMinutes <= SHORT_MAX_MINUTES;
      case 'top': return (tour.rating ?? 0) >= TOP_MIN_RATING && tour.reviewCount >= TOP_MIN_REVIEWS;
      case 'free_cancel': return tour.freeCancellation === true;
    }
  });
}
