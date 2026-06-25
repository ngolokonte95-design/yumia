/**
 * Seed YUMIA — ~120 lieux réels répartis sur Paris, Lyon, Marseille,
 * Londres et Barcelone. Tous les 14 univers sont couverts.
 *
 * Usage :  npx ts-node -r tsconfig-paths/register src/scripts/seed-places.ts
 * (ou via `npm run prisma:seed` après avoir ajouté le script dans package.json)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PlaceSeed = {
  name: string;
  universe: string;
  lat: number;
  lng: number;
  city: string;
  countryCode: string;
  rating: number;
  priceTier: number;
  tags: string[];
  photoUrls: string[];
};

const PLACES: PlaceSeed[] = [
  // ───────────────────────────────────────────────────────────
  // PARIS — restaurants
  // ───────────────────────────────────────────────────────────
  {
    name: 'Septime',
    universe: 'restaurant',
    lat: 48.8528, lng: 2.3748,
    city: 'Paris', countryCode: 'FR',
    rating: 4.8, priceTier: 4,
    tags: ['bistronomique', 'etoile', 'marché', 'terrasse'],
    photoUrls: [],
  },
  {
    name: 'Le Comptoir du Relais',
    universe: 'restaurant',
    lat: 48.8527, lng: 2.3394,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['bistro', 'saint-germain', 'traditions'],
    photoUrls: [],
  },
  {
    name: 'Frenchie',
    universe: 'restaurant',
    lat: 48.8628, lng: 2.3478,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 4,
    tags: ['neo-bistro', 'marché', 'réservation'],
    photoUrls: [],
  },
  {
    name: 'Chez L\'Ami Jean',
    universe: 'restaurant',
    lat: 48.8642, lng: 2.3058,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['basque', 'généreux', 'animé'],
    photoUrls: [],
  },
  {
    name: 'Clown Bar',
    universe: 'restaurant',
    lat: 48.8637, lng: 2.3792,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['naturel', 'vins', 'oberkampf'],
    photoUrls: [],
  },
  {
    name: 'Breizh Café Marais',
    universe: 'restaurant',
    lat: 48.8574, lng: 2.3602,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['crêpes', 'bretagne', 'cidre'],
    photoUrls: [],
  },
  {
    name: 'Bao Family',
    universe: 'restaurant',
    lat: 48.8634, lng: 2.3456,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['asiatique', 'bao', 'street-food'],
    photoUrls: [],
  },
  {
    name: 'Le Chateaubriand',
    universe: 'restaurant',
    lat: 48.8659, lng: 2.3800,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 4,
    tags: ['avant-garde', 'naturel', 'oberkampf'],
    photoUrls: [],
  },
  {
    name: 'Pink Mamma',
    universe: 'restaurant',
    lat: 48.8826, lng: 2.3466,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['italien', 'instagrammable', 'pigalle'],
    photoUrls: [],
  },

  // PARIS — cafés
  {
    name: 'Café de Flore',
    universe: 'cafe',
    lat: 48.8540, lng: 2.3330,
    city: 'Paris', countryCode: 'FR',
    rating: 4.3, priceTier: 3,
    tags: ['historique', 'terrasse', 'saint-germain'],
    photoUrls: [],
  },
  {
    name: 'Télescope Café',
    universe: 'cafe',
    lat: 48.8628, lng: 2.3406,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['specialty', 'single-origin', 'louvre'],
    photoUrls: [],
  },
  {
    name: 'Ten Belles',
    universe: 'cafe',
    lat: 48.8720, lng: 2.3668,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['specialty', 'canal-saint-martin', 'brunch'],
    photoUrls: [],
  },
  {
    name: 'Coutume Café',
    universe: 'cafe',
    lat: 48.8488, lng: 2.3233,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['torréfacteur', 'saint-germain', 'atelier'],
    photoUrls: [],
  },
  {
    name: 'Café Oberkampf',
    universe: 'cafe',
    lat: 48.8638, lng: 2.3761,
    city: 'Paris', countryCode: 'FR',
    rating: 4.3, priceTier: 1,
    tags: ['néo-bistro', 'naturel', 'oberkampf'],
    photoUrls: [],
  },
  {
    name: 'Honor Café',
    universe: 'cafe',
    lat: 48.8672, lng: 2.3371,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['specialty', 'opéra', 'cosy'],
    photoUrls: [],
  },

  // PARIS — boulangeries
  {
    name: 'Du Pain et des Idées',
    universe: 'bakery',
    lat: 48.8713, lng: 2.3620,
    city: 'Paris', countryCode: 'FR',
    rating: 4.8, priceTier: 2,
    tags: ['pain', 'viennoiserie', 'canal-saint-martin', 'iconique'],
    photoUrls: [],
  },
  {
    name: 'Maison Landemaine',
    universe: 'bakery',
    lat: 48.8780, lng: 2.3440,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['artisanal', 'croissant', 'montmartre'],
    photoUrls: [],
  },
  {
    name: 'Liberté Boulangerie',
    universe: 'bakery',
    lat: 48.8730, lng: 2.3710,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['moderne', 'goncourt', 'pain-au-chocolat'],
    photoUrls: [],
  },
  {
    name: 'Utopie Boulangerie',
    universe: 'bakery',
    lat: 48.8643, lng: 2.3792,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 1,
    tags: ['bio', 'levain', 'oberkampf'],
    photoUrls: [],
  },

  // PARIS — bars
  {
    name: 'Le Mary Celeste',
    universe: 'bar',
    lat: 48.8572, lng: 2.3596,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['cocktails', 'marais', 'oysters'],
    photoUrls: [],
  },
  {
    name: 'Candelaria',
    universe: 'bar',
    lat: 48.8571, lng: 2.3555,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['mezcal', 'cocktails-createurs', 'speakeasy'],
    photoUrls: [],
  },
  {
    name: 'Le Syndicat',
    universe: 'bar',
    lat: 48.8707, lng: 2.3535,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['cocktails', 'spiritueux-français', 'saint-denis'],
    photoUrls: [],
  },
  {
    name: 'Glass Bar',
    universe: 'bar',
    lat: 48.8823, lng: 2.3445,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['pigalle', 'live-music', 'shots'],
    photoUrls: [],
  },
  {
    name: 'Bar Hemingway — Ritz',
    universe: 'bar',
    lat: 48.8686, lng: 2.3296,
    city: 'Paris', countryCode: 'FR',
    rating: 4.9, priceTier: 4,
    tags: ['luxe', 'cocktails-classiques', 'historique'],
    photoUrls: [],
  },

  // PARIS — desserts
  {
    name: 'Pierre Hermé',
    universe: 'dessert',
    lat: 48.8517, lng: 2.3291,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['macarons', 'pâtisserie', 'saint-germain'],
    photoUrls: [],
  },
  {
    name: 'Sadaharu Aoki',
    universe: 'dessert',
    lat: 48.8496, lng: 2.3384,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['japonais', 'matcha', 'fusion'],
    photoUrls: [],
  },
  {
    name: 'La Meringaie',
    universe: 'dessert',
    lat: 48.8660, lng: 2.3323,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['meringue', 'coloré', 'instagrammable'],
    photoUrls: [],
  },

  // PARIS — rooftops
  {
    name: 'Rooftop Perruche',
    universe: 'rooftop',
    lat: 48.8705, lng: 2.3308,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['vue-tour-eiffel', 'cocktails', 'printemps'],
    photoUrls: [],
  },
  {
    name: 'Terrasse Galeries Lafayette',
    universe: 'rooftop',
    lat: 48.8733, lng: 2.3320,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 1,
    tags: ['panoramique', 'free', 'paris-center'],
    photoUrls: [],
  },
  {
    name: 'Le Tout-Paris — Cheval Blanc',
    universe: 'rooftop',
    lat: 48.8570, lng: 2.3525,
    city: 'Paris', countryCode: 'FR',
    rating: 4.8, priceTier: 4,
    tags: ['luxe', 'seine', 'notre-dame'],
    photoUrls: [],
  },

  // PARIS — bubble tea
  {
    name: 'Tiger Sugar Paris',
    universe: 'bubble_tea',
    lat: 48.8646, lng: 2.3488,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['brown-sugar', 'taïwanais', 'les-halles'],
    photoUrls: [],
  },
  {
    name: 'Koi The',
    universe: 'bubble_tea',
    lat: 48.8621, lng: 2.3467,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['boba', 'thai', 'les-halles'],
    photoUrls: [],
  },
  {
    name: 'The Alley Paris',
    universe: 'bubble_tea',
    lat: 48.8580, lng: 2.3481,
    city: 'Paris', countryCode: 'FR',
    rating: 4.3, priceTier: 2,
    tags: ['boba', 'marais', 'deerioca'],
    photoUrls: [],
  },

  // PARIS — local specialty
  {
    name: 'L\'Avant Comptoir de la Mer',
    universe: 'local_specialty',
    lat: 48.8523, lng: 2.3388,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['fruits-de-mer', 'debout', 'saint-germain'],
    photoUrls: [],
  },
  {
    name: 'Chez Janou',
    universe: 'local_specialty',
    lat: 48.8561, lng: 2.3618,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['provençal', 'pastis', 'marais'],
    photoUrls: [],
  },

  // PARIS — glace
  {
    name: 'Grom',
    universe: 'ice_cream',
    lat: 48.8680, lng: 2.3332,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 2,
    tags: ['gelato', 'naturel', 'opéra'],
    photoUrls: [],
  },
  {
    name: 'Amorino Saint-Germain',
    universe: 'ice_cream',
    lat: 48.8534, lng: 2.3337,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['gelato', 'fleur', 'saint-germain'],
    photoUrls: [],
  },

  // PARIS — chocolatier
  {
    name: 'Patrick Roger',
    universe: 'chocolatier',
    lat: 48.8698, lng: 2.3315,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['artisanal', 'sculptures', 'madeleine'],
    photoUrls: [],
  },
  {
    name: 'Jacques Genin',
    universe: 'chocolatier',
    lat: 48.8600, lng: 2.3587,
    city: 'Paris', countryCode: 'FR',
    rating: 4.8, priceTier: 3,
    tags: ['ganaches', 'caramels', 'marais', 'salon-de-thé'],
    photoUrls: [],
  },

  // PARIS — cave à vin
  {
    name: 'La Cave de Septime',
    universe: 'wine_cellar',
    lat: 48.8530, lng: 2.3740,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['naturel', 'bistronomie', 'charonne'],
    photoUrls: [],
  },
  {
    name: 'Racines des Prés',
    universe: 'wine_cellar',
    lat: 48.8505, lng: 2.3259,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['naturel', 'buvette', 'saint-germain'],
    photoUrls: [],
  },

  // PARIS — sorties culturelles
  {
    name: 'Centre Pompidou',
    universe: 'cultural_outing',
    lat: 48.8607, lng: 2.3523,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['art-moderne', 'expo', 'beaubourg'],
    photoUrls: [],
  },
  {
    name: 'Palais de Tokyo',
    universe: 'cultural_outing',
    lat: 48.8637, lng: 2.2965,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['art-contemporain', 'nocturne', 'trocadero'],
    photoUrls: [],
  },
  {
    name: 'Fondation Louis Vuitton',
    universe: 'cultural_outing',
    lat: 48.8765, lng: 2.2572,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['architecture', 'gehry', 'art-contemporain'],
    photoUrls: [],
  },

  // PARIS — activités touristiques
  {
    name: 'Tour Eiffel',
    universe: 'tourist_activity',
    lat: 48.8584, lng: 2.2945,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['incontournable', 'vue', 'fer'],
    photoUrls: [],
  },
  {
    name: 'Musée du Louvre',
    universe: 'tourist_activity',
    lat: 48.8606, lng: 2.3376,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['musée', 'art', 'mona-lisa', 'pyramide'],
    photoUrls: [],
  },
  {
    name: 'Balade en Vélo — Marais',
    universe: 'tourist_activity',
    lat: 48.8570, lng: 2.3520,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 1,
    tags: ['vélo', 'balade', 'marais', 'actif'],
    photoUrls: [],
  },

  // PARIS — nightlife
  {
    name: 'La Concrete',
    universe: 'nightlife',
    lat: 48.8489, lng: 2.3785,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['techno', 'seine', 'péniche', 'bercy'],
    photoUrls: [],
  },
  {
    name: 'Rex Club',
    universe: 'nightlife',
    lat: 48.8699, lng: 2.3490,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['techno', 'grand-rex', 'légendaire'],
    photoUrls: [],
  },
  {
    name: 'Silencio',
    universe: 'nightlife',
    lat: 48.8641, lng: 2.3453,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 4,
    tags: ['membres', 'lynch', 'les-halles', 'exclusif'],
    photoUrls: [],
  },

  // ───────────────────────────────────────────────────────────
  // LYON
  // ───────────────────────────────────────────────────────────
  {
    name: 'Le Bouchon des Filles',
    universe: 'restaurant',
    lat: 45.7670, lng: 4.8330,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['bouchon', 'lyonnais', 'croix-rousse'],
    photoUrls: [],
  },
  {
    name: 'Daniel et Denise Créqui',
    universe: 'restaurant',
    lat: 45.7621, lng: 4.8432,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.7, priceTier: 3,
    tags: ['bouchon', 'mof', 'quenelles'],
    photoUrls: [],
  },
  {
    name: 'Café Mokxa',
    universe: 'cafe',
    lat: 45.7490, lng: 4.8298,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['specialty', 'torréfacteur', 'presqu-île'],
    photoUrls: [],
  },
  {
    name: 'Bernachon',
    universe: 'chocolatier',
    lat: 45.7610, lng: 4.8560,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.9, priceTier: 3,
    tags: ['légendaire', 'bean-to-bar', 'foch'],
    photoUrls: [],
  },
  {
    name: 'Le Sucré Coeur',
    universe: 'bakery',
    lat: 45.7720, lng: 4.8270,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.5, priceTier: 1,
    tags: ['croix-rousse', 'levain', 'viennoiserie'],
    photoUrls: [],
  },
  {
    name: 'Musée des Confluences',
    universe: 'cultural_outing',
    lat: 45.7330, lng: 4.8178,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['sciences', 'architecture', 'confluences'],
    photoUrls: [],
  },
  {
    name: 'Rooftop Villa Florentine',
    universe: 'rooftop',
    lat: 45.7614, lng: 4.8230,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.8, priceTier: 4,
    tags: ['fourvière', 'panoramique', 'luxe'],
    photoUrls: [],
  },
  {
    name: 'L\'Antiquaire',
    universe: 'bar',
    lat: 45.7563, lng: 4.8306,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['whisky', 'bourbon', 'presqu-île'],
    photoUrls: [],
  },
  {
    name: 'Glaces Terre Adélice',
    universe: 'ice_cream',
    lat: 45.7667, lng: 4.8347,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['artisanal', 'croix-rousse', 'bio'],
    photoUrls: [],
  },
  {
    name: 'Le Verre et l\'Assiette',
    universe: 'wine_cellar',
    lat: 45.7593, lng: 4.8359,
    city: 'Lyon', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['naturel', 'bistronomie', 'terreaux'],
    photoUrls: [],
  },

  // ───────────────────────────────────────────────────────────
  // MARSEILLE
  // ───────────────────────────────────────────────────────────
  {
    name: 'Une Table au Sud',
    universe: 'restaurant',
    lat: 43.2959, lng: 5.3693,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.7, priceTier: 4,
    tags: ['étoilé', 'vieux-port', 'méditerranéen'],
    photoUrls: [],
  },
  {
    name: 'Chez Madie Les Galinettes',
    universe: 'restaurant',
    lat: 43.2960, lng: 5.3706,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['bouillabaisse', 'vieux-port', 'tradition'],
    photoUrls: [],
  },
  {
    name: 'Le Café des Épices',
    universe: 'restaurant',
    lat: 43.2975, lng: 5.3700,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['créatif', 'épices', 'mairie'],
    photoUrls: [],
  },
  {
    name: 'La Caravelle',
    universe: 'bar',
    lat: 43.2954, lng: 5.3699,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['vieux-port', 'mezzanine', 'jazz'],
    photoUrls: [],
  },
  {
    name: 'Café Noailles',
    universe: 'cafe',
    lat: 43.2964, lng: 5.3740,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.4, priceTier: 1,
    tags: ['noailles', 'populaire', 'espresso'],
    photoUrls: [],
  },
  {
    name: 'MuCEM',
    universe: 'cultural_outing',
    lat: 43.2970, lng: 5.3602,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.6, priceTier: 2,
    tags: ['méditerranée', 'architecture', 'vieux-port'],
    photoUrls: [],
  },
  {
    name: 'Calanques de Cassis',
    universe: 'tourist_activity',
    lat: 43.2132, lng: 5.5384,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.9, priceTier: 1,
    tags: ['nature', 'bateau', 'snorkeling', 'randonnée'],
    photoUrls: [],
  },
  {
    name: 'Rooftop Bar Du Palais',
    universe: 'rooftop',
    lat: 43.2941, lng: 5.3713,
    city: 'Marseille', countryCode: 'FR',
    rating: 4.4, priceTier: 3,
    tags: ['vieux-port', 'coucher-de-soleil', 'cocktails'],
    photoUrls: [],
  },

  // ───────────────────────────────────────────────────────────
  // LONDON
  // ───────────────────────────────────────────────────────────
  {
    name: 'Dishoom',
    universe: 'restaurant',
    lat: 51.5124, lng: -0.1243,
    city: 'London', countryCode: 'GB',
    rating: 4.6, priceTier: 2,
    tags: ['indien', 'bombay-café', 'covent-garden'],
    photoUrls: [],
  },
  {
    name: 'St. John Restaurant',
    universe: 'restaurant',
    lat: 51.5204, lng: -0.1017,
    city: 'London', countryCode: 'GB',
    rating: 4.7, priceTier: 4,
    tags: ['nose-to-tail', 'british', 'clerkenwell'],
    photoUrls: [],
  },
  {
    name: 'Monmouth Coffee',
    universe: 'cafe',
    lat: 51.5135, lng: -0.1240,
    city: 'London', countryCode: 'GB',
    rating: 4.7, priceTier: 2,
    tags: ['specialty', 'borough-market', 'legendary'],
    photoUrls: [],
  },
  {
    name: 'Gymkhana',
    universe: 'local_specialty',
    lat: 51.5091, lng: -0.1411,
    city: 'London', countryCode: 'GB',
    rating: 4.6, priceTier: 4,
    tags: ['indian', 'michelin', 'mayfair'],
    photoUrls: [],
  },
  {
    name: 'Sketch — The Gallery',
    universe: 'bar',
    lat: 51.5127, lng: -0.1423,
    city: 'London', countryCode: 'GB',
    rating: 4.5, priceTier: 4,
    tags: ['instagrammable', 'rose', 'mayfair', 'cocktails'],
    photoUrls: [],
  },
  {
    name: 'Fabric',
    universe: 'nightlife',
    lat: 51.5201, lng: -0.1033,
    city: 'London', countryCode: 'GB',
    rating: 4.5, priceTier: 2,
    tags: ['techno', 'legendary', 'farringdon'],
    photoUrls: [],
  },
  {
    name: 'Tate Modern',
    universe: 'cultural_outing',
    lat: 51.5076, lng: -0.0994,
    city: 'London', countryCode: 'GB',
    rating: 4.7, priceTier: 1,
    tags: ['art-moderne', 'bankside', 'free-entry'],
    photoUrls: [],
  },
  {
    name: 'Fortnum & Mason',
    universe: 'local_specialty',
    lat: 51.5093, lng: -0.1389,
    city: 'London', countryCode: 'GB',
    rating: 4.6, priceTier: 3,
    tags: ['thé', 'épicerie-fine', 'picadilly', 'afternoon-tea'],
    photoUrls: [],
  },

  // ───────────────────────────────────────────────────────────
  // BARCELONE
  // ───────────────────────────────────────────────────────────
  {
    name: 'Bar Calders',
    universe: 'bar',
    lat: 41.3756, lng: 2.1600,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.5, priceTier: 2,
    tags: ['sant-pere', 'terrasse', 'vermouth'],
    photoUrls: [],
  },
  {
    name: 'El Xampanyet',
    universe: 'bar',
    lat: 41.3847, lng: 2.1815,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.6, priceTier: 1,
    tags: ['cava', 'tapas', 'born', 'historique'],
    photoUrls: [],
  },
  {
    name: 'Cervecería Catalana',
    universe: 'restaurant',
    lat: 41.3928, lng: 2.1620,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.5, priceTier: 2,
    tags: ['tapas', 'pintxos', 'eixample'],
    photoUrls: [],
  },
  {
    name: 'La Pepita Bistrot',
    universe: 'restaurant',
    lat: 41.3793, lng: 2.1720,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.4, priceTier: 2,
    tags: ['healthy', 'bocadillos', 'gracia'],
    photoUrls: [],
  },
  {
    name: 'Garage Beer Co.',
    universe: 'bar',
    lat: 41.3919, lng: 2.1608,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.6, priceTier: 2,
    tags: ['craft-beer', 'eixample', 'microbrasserie'],
    photoUrls: [],
  },
  {
    name: 'Museu Picasso',
    universe: 'cultural_outing',
    lat: 41.3851, lng: 2.1806,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.6, priceTier: 2,
    tags: ['picasso', 'born', 'gothique'],
    photoUrls: [],
  },
  {
    name: 'La Sagrada Família',
    universe: 'tourist_activity',
    lat: 41.4036, lng: 2.1744,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.8, priceTier: 2,
    tags: ['gaudí', 'incontournable', 'architecture'],
    photoUrls: [],
  },
  {
    name: 'Tickets Bar',
    universe: 'local_specialty',
    lat: 41.3762, lng: 2.1535,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.7, priceTier: 3,
    tags: ['adrià', 'tapas-créatives', 'eixample'],
    photoUrls: [],
  },
  {
    name: 'La Barceloneta Beach',
    universe: 'tourist_activity',
    lat: 41.3772, lng: 2.1887,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.4, priceTier: 1,
    tags: ['plage', 'mer', 'barceloneta'],
    photoUrls: [],
  },
  {
    name: 'Eclipse Rooftop W Barcelona',
    universe: 'rooftop',
    lat: 41.3729, lng: 2.1897,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.5, priceTier: 4,
    tags: ['port', 'luxe', 'cocktails', 'mer'],
    photoUrls: [],
  },
  {
    name: 'Pastisseria Escribà',
    universe: 'dessert',
    lat: 41.3799, lng: 2.1714,
    city: 'Barcelona', countryCode: 'ES',
    rating: 4.6, priceTier: 3,
    tags: ['moderniste', 'gâteaux', 'rambla'],
    photoUrls: [],
  },

  // ───────────────────────────────────────────────────────────
  // PARIS — extra pour couvrir la densité attendue en MVP
  // ───────────────────────────────────────────────────────────
  {
    name: 'Vivant Table',
    universe: 'restaurant',
    lat: 48.8701, lng: 2.3544,
    city: 'Paris', countryCode: 'FR',
    rating: 4.6, priceTier: 3,
    tags: ['naturel', 'cave-épicerie', 'faubourg-saint-denis'],
    photoUrls: [],
  },
  {
    name: 'Le Grand Bain',
    universe: 'restaurant',
    lat: 48.8733, lng: 2.3840,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 3,
    tags: ['végétarien', 'menilmontant', 'partage'],
    photoUrls: [],
  },
  {
    name: 'Mokonuts',
    universe: 'cafe',
    lat: 48.8506, lng: 2.3776,
    city: 'Paris', countryCode: 'FR',
    rating: 4.8, priceTier: 2,
    tags: ['cookies', 'brunch', 'nation'],
    photoUrls: [],
  },
  {
    name: 'Coffee Eleven',
    universe: 'cafe',
    lat: 48.8672, lng: 2.3758,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['specialty', 'oberkampf', 'flat-white'],
    photoUrls: [],
  },
  {
    name: 'Boulangerie Poilâne',
    universe: 'bakery',
    lat: 48.8504, lng: 2.3334,
    city: 'Paris', countryCode: 'FR',
    rating: 4.7, priceTier: 2,
    tags: ['miche', 'saint-germain', 'mythique'],
    photoUrls: [],
  },
  {
    name: 'Fou de Pâtisserie',
    universe: 'dessert',
    lat: 48.8625, lng: 2.3467,
    city: 'Paris', countryCode: 'FR',
    rating: 4.5, priceTier: 2,
    tags: ['multi-chefs', 'marais', 'éclectique'],
    photoUrls: [],
  },
  {
    name: 'Nüba',
    universe: 'rooftop',
    lat: 48.8352, lng: 2.3645,
    city: 'Paris', countryCode: 'FR',
    rating: 4.4, priceTier: 3,
    tags: ['cité-mode', 'bercy', 'dj', 'cocktails'],
    photoUrls: [],
  },
  {
    name: 'Le Baron',
    universe: 'nightlife',
    lat: 48.8661, lng: 2.3096,
    city: 'Paris', countryCode: 'FR',
    rating: 4.3, priceTier: 3,
    tags: ['champs-elysées', 'liste', 'dj'],
    photoUrls: [],
  },
  // ───────────────────────────────────────────────────────────
  // CERGY / CERGY-PONTOISE (95) — données de démo pour tests locaux
  // Regroupées autour du centre (~49.037, 2.071) pour tomber dans le rayon ~3 km.
  // ───────────────────────────────────────────────────────────
  { name: 'Le Carré des Sens', universe: 'restaurant', lat: 49.0361, lng: 2.0779, city: 'Cergy', countryCode: 'FR', rating: 4.5, priceTier: 2, tags: ['bistronomique', 'terrasse'], photoUrls: [] },
  { name: "Bistrot de l'Axe Majeur", universe: 'restaurant', lat: 49.0388, lng: 2.0512, city: 'Cergy', countryCode: 'FR', rating: 4.4, priceTier: 2, tags: ['traditionnel', 'vue'], photoUrls: [] },
  { name: 'Sushi Cergy Préfecture', universe: 'restaurant', lat: 49.0345, lng: 2.0801, city: 'Cergy', countryCode: 'FR', rating: 4.3, priceTier: 2, tags: ['japonais', 'sushi'], photoUrls: [] },
  { name: 'Café de la Préfecture', universe: 'cafe', lat: 49.0352, lng: 2.0772, city: 'Cergy', countryCode: 'FR', rating: 4.2, priceTier: 1, tags: ['cosy', 'wifi'], photoUrls: [] },
  { name: 'Le Comptoir Cergyssois', universe: 'cafe', lat: 49.0340, lng: 2.0815, city: 'Cergy', countryCode: 'FR', rating: 4.4, priceTier: 1, tags: ['brunch', 'terrasse'], photoUrls: [] },
  { name: 'Boulangerie des 3 Fontaines', universe: 'bakery', lat: 49.0357, lng: 2.0786, city: 'Cergy', countryCode: 'FR', rating: 4.6, priceTier: 1, tags: ['artisanal', 'viennoiseries'], photoUrls: [] },
  { name: 'Le Fournil Sucré', universe: 'dessert', lat: 49.0366, lng: 2.0748, city: 'Cergy', countryCode: 'FR', rating: 4.5, priceTier: 1, tags: ['pâtisserie', 'maison'], photoUrls: [] },
  { name: "L'Annexe Bar", universe: 'bar', lat: 49.0348, lng: 2.0796, city: 'Cergy', countryCode: 'FR', rating: 4.3, priceTier: 2, tags: ['cocktails', 'ambiance'], photoUrls: [] },
  { name: "Skyline Rooftop Cergy", universe: 'rooftop', lat: 49.0333, lng: 2.0709, city: 'Cergy', countryCode: 'FR', rating: 4.5, priceTier: 3, tags: ['vue', 'cocktails'], photoUrls: [] },
  { name: 'Tasty Bubble Cergy', universe: 'bubble_tea', lat: 49.0354, lng: 2.0789, city: 'Cergy', countryCode: 'FR', rating: 4.2, priceTier: 1, tags: ['bubble tea', 'à emporter'], photoUrls: [] },
  { name: "Glacier de l'Oise", universe: 'ice_cream', lat: 49.0312, lng: 2.0641, city: 'Cergy', countryCode: 'FR', rating: 4.6, priceTier: 1, tags: ['glaces', 'artisanal'], photoUrls: [] },
  { name: 'Théâtre 95', universe: 'cultural_outing', lat: 49.0349, lng: 2.0768, city: 'Cergy', countryCode: 'FR', rating: 4.7, priceTier: 2, tags: ['spectacle', 'culture'], photoUrls: [] },
  { name: 'Île de Loisirs de Cergy-Pontoise', universe: 'tourist_activity', lat: 49.0205, lng: 2.0566, city: 'Cergy', countryCode: 'FR', rating: 4.5, priceTier: 2, tags: ['plein air', 'famille', 'nautique'], photoUrls: [] },
  { name: 'La Cave de Cergy', universe: 'wine_cellar', lat: 49.0363, lng: 2.0763, city: 'Cergy', countryCode: 'FR', rating: 4.4, priceTier: 2, tags: ['vins', 'dégustation'], photoUrls: [] },
];

async function seed() {
  console.log(`🌱 Seeding ${PLACES.length} places…`);

  let created = 0;
  let skipped = 0;

  for (const p of PLACES) {
    const existing = await prisma.place.findFirst({
      where: { name: p.name, city: p.city },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.place.create({
      data: {
        name: p.name,
        universe: p.universe as Parameters<typeof prisma.place.create>[0]['data']['universe'],
        lat: p.lat,
        lng: p.lng,
        city: p.city,
        countryCode: p.countryCode,
        rating: p.rating,
        priceTier: p.priceTier,
        tags: p.tags,
        photoUrls: p.photoUrls,
      },
    });
    created++;
  }

  console.log(`✅ Created ${created} places, skipped ${skipped} (already exist).`);
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
