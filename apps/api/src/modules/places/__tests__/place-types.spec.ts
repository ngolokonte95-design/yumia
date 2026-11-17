import { UNIVERSES, type Universe } from '@yumia/shared';
import {
  classifyGooglePlace,
  googleTypesToUniverse,
  hydrationVersion,
  isBlockedPlace,
  KEYWORD_UNIVERSES,
  TEXT_FIRST_UNIVERSES,
  UNIVERSE_TEXT_QUERIES,
  universeToGoogleTypes,
} from '../providers/place-types';
import { parseUnsupportedTypes } from '../providers/google-places.provider';
import { targetUniverse } from '../../../scripts/reclassify-places';

const classify = (name: string, types: string[], requested?: Universe, forced = false) =>
  classifyGooglePlace({ name, types, requested, forced });

describe('classement des lieux Google', () => {
  it('ne dépend pas de la recherche qui a trouvé le lieu', () => {
    const barTabac = ['bar', 'store', 'point_of_interest'];
    for (const requested of ['bar', 'tobacco', 'restaurant', undefined] as (Universe | undefined)[]) {
      expect(classify('Bar Tabac Le Balto', barTabac, requested)).toBe('tobacco');
    }
    const brasserie = ['restaurant', 'bar', 'cafe'];
    for (const requested of ['bar', 'cafe', 'restaurant', 'pub'] as Universe[]) {
      expect(classify('Brasserie du Centre', brasserie, requested)).toBe('restaurant');
    }
  });

  describe('tabac & presse', () => {
    it('reconnaît un tabac à son nom, quel que soit son type', () => {
      expect(classify('Tabac de la Gare', ['convenience_store', 'store'])).toBe('tobacco');
      expect(classify('LE CELTIC - Tabac Presse Loto', ['bar'])).toBe('tobacco');
      expect(classify('Tabaccheria Rossi', ['store'])).toBe('tobacco');
      expect(classify('Estanco Nº 12', ['store'])).toBe('tobacco');
    });

    it('range une maison de la presse en tabac & presse, pas un café « de la Presse »', () => {
      expect(classify('Maison de la Presse', ['book_store', 'store'])).toBe('tobacco');
      expect(classify('Café de la Presse', ['cafe', 'bar'])).toBe('cafe');
    });

    it('garde un tabac sans le mot dans son nom, trouvé par la recherche dédiée', () => {
      expect(classify('Le Narval', ['bar', 'store'], 'tobacco', true)).toBe('tobacco');
    });

    it('laisse un bar à chicha « Tabac » en chicha', () => {
      expect(classify('Tabac & Chicha Lounge', ['bar'], 'hookah', true)).toBe('hookah');
    });

    it("ne demande plus les épiceries à Google pour remplir l'univers", () => {
      expect(universeToGoogleTypes('tobacco')).not.toContain('convenience_store');
      expect(TEXT_FIRST_UNIVERSES.has('tobacco')).toBe(true);
    });
  });

  describe('épiceries de quartier et supermarchés', () => {
    const both = ['supermarket', 'grocery_store', 'food_store', 'store'];

    it('range les grandes enseignes en supermarchés, même au format supérette', () => {
      for (const name of ['Carrefour City', 'Franprix', 'E.Leclerc CERGY', 'Lidl', 'Monoprix', 'Auchan Supermarché', 'Intermarché Express']) {
        expect(classify(name, both, 'grocery_store')).toBe('supermarket');
        expect(classify(name, ['grocery_store', 'store'], 'grocery_store')).toBe('supermarket');
      }
    });

    it('range les commerces de quartier en épiceries, même typés supermarket', () => {
      for (const name of ['Alimentation Générale', 'Épicerie du Coin', 'Exotique Market Lycamobile', 'Chez Ali']) {
        expect(classify(name, both, 'supermarket')).toBe('grocery_store');
        expect(classify(name, ['convenience_store', 'store'], 'tobacco')).toBe('grocery_store');
      }
    });

    it('range un hypermarché en supermarchés', () => {
      expect(classify('Centre commercial des Trois Fontaines', ['hypermarket', 'grocery_store'])).toBe('supermarket');
    });

    it("garde l'enseigne en supermarché quand la recherche « épicerie » la remonte", () => {
      expect(classify('Carrefour Express', ['store'], 'grocery_store', true)).toBe('supermarket');
      expect(classify('Alimentation Générale', ['store'], 'grocery_store', true)).toBe('grocery_store');
    });

    it('ne prend pas la boutique d\'une station-service pour une épicerie', () => {
      expect(classify('TotalEnergies', ['gas_station', 'convenience_store'])).toBe('fuel');
    });

    it('demande à Google les types des épiceries de quartier', () => {
      expect(universeToGoogleTypes('grocery_store')).toEqual(
        expect.arrayContaining(['grocery_store', 'convenience_store']),
      );
    });
  });

  describe('types', () => {
    it('suit le type principal du lieu', () => {
      expect(googleTypesToUniverse(['movie_theater', 'candy_store'])).toBe('cinema');
      expect(googleTypesToUniverse(['supermarket', 'bakery', 'florist'])).toBe('supermarket');
    });

    it('préfère la spécialisation à son type parent', () => {
      expect(googleTypesToUniverse(['bar', 'pub'])).toBe('pub');
      expect(googleTypesToUniverse(['bar', 'restaurant', 'karaoke'])).toBe('karaoke');
      expect(googleTypesToUniverse(['park', 'botanical_garden'])).toBe('botanical_garden');
      expect(googleTypesToUniverse(['beauty_salon', 'nail_salon'])).toBe('nail_salon');
      expect(googleTypesToUniverse(['bar', 'restaurant'])).toBe('bar');
    });

    it('ne laisse tourist_attraction décider qu\'en dernier recours', () => {
      expect(googleTypesToUniverse(['tourist_attraction', 'museum'])).toBe('museum');
      expect(googleTypesToUniverse(['tourist_attraction', 'park'])).toBe('park');
      expect(googleTypesToUniverse(['tourist_attraction'])).toBe('tourist_activity');
    });

    it('ne range plus les ports en jet ski ni les salles de jeux en escape games', () => {
      expect(googleTypesToUniverse(['marina'])).toBe('port');
      expect(googleTypesToUniverse(['amusement_center'])).toBe('amusement_park');
    });

    it('retombe sur l\'univers demandé quand aucun type n\'est connu', () => {
      expect(classify('Inconnu', ['point_of_interest'], 'laundry')).toBe('laundry');
      expect(classify('Inconnu', ['point_of_interest'])).toBe('restaurant');
    });
  });

  describe('table des univers', () => {
    it('ne demande jamais le type défini par un autre univers', () => {
      const owner = new Map<string, Universe>();
      for (const universe of UNIVERSES as readonly Universe[]) {
        for (const type of universeToGoogleTypes(universe)) {
          expect([type, owner.get(type)]).toEqual([type, undefined]);
          owner.set(type, universe);
        }
      }
    });

    it('classe chaque type demandé dans son propre univers', () => {
      for (const universe of UNIVERSES as readonly Universe[]) {
        if (TEXT_FIRST_UNIVERSES.has(universe)) continue;
        for (const type of universeToGoogleTypes(universe)) {
          expect([type, googleTypesToUniverse([type], 'restaurant')]).toEqual([type, universe]);
        }
      }
    });

    it('donne une recherche à chaque univers : des types ou un texte', () => {
      for (const universe of UNIVERSES as readonly Universe[]) {
        const hasTypes = universeToGoogleTypes(universe).length > 0;
        expect([universe, hasTypes || !!UNIVERSE_TEXT_QUERIES[universe]]).toEqual([universe, true]);
        if (TEXT_FIRST_UNIVERSES.has(universe)) {
          expect([universe, !!UNIVERSE_TEXT_QUERIES[universe]]).toEqual([universe, true]);
        }
      }
    });

    it('recharge seulement les univers dont la recherche a changé', () => {
      expect(hydrationVersion('tobacco')).toBe('v7');
      expect(hydrationVersion('grocery_store')).toBe('v7');
      expect(hydrationVersion('restaurant')).toBe('v6');
      expect(hydrationVersion(undefined)).toBe('v6');
    });

    it('laisse passer épiceries et tabacs malgré les types bloqués ailleurs', () => {
      expect(isBlockedPlace(['convenience_store'], 'grocery_store')).toBe(false);
      expect(isBlockedPlace(['convenience_store'], 'tobacco')).toBe(false);
      expect(isBlockedPlace(['restaurant', 'convenience_store'], 'restaurant')).toBe(true);
    });
  });
});

describe('types refusés par Google', () => {
  it('lit les types dans le message d\'erreur', () => {
    const body = '{"error":{"code":400,"message":"Unsupported types: bubble_tea_store, juice_bar.","status":"INVALID_ARGUMENT"}}';
    expect(parseUnsupportedTypes(body)).toEqual(['bubble_tea_store', 'juice_bar']);
    expect(parseUnsupportedTypes('Invalid radius')).toEqual([]);
  });
});

describe('reclassement des lieux en base', () => {
  const place = (name: string, universe: Universe, tags: string[]) => ({ name, universe, tags });

  it('sort les tabacs des bars et les grandes surfaces des épiceries', () => {
    expect(targetUniverse(place('Bar Tabac des Sports', 'bar', ['bar']))).toBe('tobacco');
    expect(targetUniverse(place('Carrefour Market', 'grocery_store', ['grocery_store', 'supermarket']))).toBe('supermarket');
    expect(targetUniverse(place('Alimentation Générale', 'supermarket', ['supermarket', 'grocery_store']))).toBe('grocery_store');
    expect(targetUniverse(place('Épicerie de Nuit', 'tobacco', ['convenience_store']))).toBe('grocery_store');
    expect(targetUniverse(place('Le Narval', 'tobacco', ['bar']))).toBe('tobacco');
  });

  it('vide les univers remplis par un type compagnon, sauf si le nom les justifie', () => {
    expect(targetUniverse(place('Le Comptoir', 'rooftop', ['bar', 'restaurant']))).toBe('bar');
    expect(targetUniverse(place('Le Perchoir Rooftop', 'rooftop', ['bar']))).toBe('rooftop');
    expect(targetUniverse(place('Zara', 'lingerie', ['clothing_store']))).toBe('shopping');
    expect(targetUniverse(place('Etam Lingerie', 'lingerie', ['clothing_store']))).toBe('lingerie');
    expect(targetUniverse(place('Parc de la Mairie', 'quad', ['park']))).toBe('park');
    expect(targetUniverse(place('Basic-Fit', 'yoga_studio', ['gym', 'fitness_center']))).toBe('gym');
    expect(targetUniverse(place('Boulangerie Paul', 'dessert', ['bakery', 'cafe']))).toBe('bakery');
  });

  it('ne touche pas aux univers remplis par une vraie recherche textuelle', () => {
    expect(targetUniverse(place('The Bulldog', 'cannabis', ['cafe', 'coffee_shop']))).toBe('cannabis');
    expect(targetUniverse(place('Sahara Lounge', 'hookah', ['bar']))).toBe('hookah');
    expect(KEYWORD_UNIVERSES.has('cannabis')).toBe(true);
  });

  it('ne rejuge pas un univers propre sur des types tronqués (6 en base)', () => {
    expect(targetUniverse(place('So Night', 'nightclub', ['bar', 'restaurant', 'point_of_interest']))).toBe('nightclub');
    expect(targetUniverse(place('Dishoom Shoreditch', 'restaurant', ['bar', 'restaurant']))).toBe('restaurant');
    expect(targetUniverse(place('Restaurant La Boucherie', 'nightclub', ['butcher_shop', 'restaurant']))).toBe('nightclub');
    expect(targetUniverse(place('Société Générale', 'atm', ['bank', 'atm']))).toBe('atm');
  });

  it('ne prend pas « Carrefour Spectacles » pour un supermarché', () => {
    expect(targetUniverse(place('Carrefour Spectacles', 'cinema', ['event_venue', 'point_of_interest']))).toBe('cinema');
  });

  it('range les univers disparus de l\'app', () => {
    expect(targetUniverse(place('Châtelet', 'cheese_shop' as Universe, ['subway_station', 'transit_station']))).toBe('gare');
  });

  it("n'envoie plus un McDonald's en brunch", () => {
    expect(targetUniverse(place("McDonald's", 'cafe', ['breakfast_restaurant', 'fast_food_restaurant']))).toBe('cafe');
    expect(googleTypesToUniverse(['breakfast_restaurant', 'fast_food_restaurant'])).toBe('restaurant');
  });

  it('laisse en place un lieu que rien ne permet de reclasser', () => {
    expect(targetUniverse(place('Sans indice', 'laundry', ['point_of_interest']))).toBe('laundry');
  });
});
