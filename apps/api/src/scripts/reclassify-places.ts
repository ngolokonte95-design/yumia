/**
 * Reclasse les lieux Google déjà en base avec les règles de
 * `classifyGooglePlace` (17/11/2026).
 *
 * Pourquoi : jusque-là, l'univers d'un lieu dépendait de la dernière
 * recherche qui l'avait trouvé, et plusieurs univers demandaient à Google des
 * types « compagnons ». Résultat en base : des bars-tabacs en Bars, des
 * grandes surfaces en Épiceries, tous les bars d'un quartier en Rooftops,
 * tous les parcs en Quad, toutes les boutiques en Lingerie…
 *
 * Piège : `tags` ne garde que les 6 PREMIERS types Google du lieu. Le type
 * qui justifiait son univers (`night_club` d'un club typé bar, restaurant,
 * event_venue…) a pu être coupé. Les univers que l'ancienne recherche
 * remplissait proprement ne sont donc pas rejugés sur leurs types — un
 * premier essai envoyait 331 night-clubs en Bars.
 *
 * Règles :
 *  - partout : un tabac reconnu à son nom va en Tabac & Presse ; une grande
 *    enseigne ou une épicerie de quartier, reconnue à son nom et à ses types,
 *    va en Supermarchés ou en Épiceries ;
 *  - univers « mot-clé » rempli par une vraie recherche textuelle (chicha,
 *    coffeeshop, opticien…) : on rejoue la recherche, seul le nom déplace ;
 *  - univers « mot-clé » pollués par un type compagnon (rooftop, brunch,
 *    lingerie… : `KEYWORD_NAME_HINTS`) : on n'y reste que si le nom le dit ;
 *  - Tabac & Presse : on n'y reste que si le nom le dit, sauf lieu sans type
 *    de commerce alimentaire (l'ancienne recherche y versait des épiceries) ;
 *  - univers pollués par un type compagnon ({@link REJUDGED_UNIVERSES}) et
 *    univers disparus : l'univers que donnent le nom et les types ;
 *  - tous les autres : inchangés.
 * Seuls les lieux importés de Google sont touchés (les types sont dans `tags`).
 *
 * Lecture seule par défaut — il faut `--appliquer` pour écrire.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/reclassify-places.js
 *   node dist/scripts/reclassify-places.js --appliquer
 */
import { PrismaClient } from '@prisma/client';
import { isUniverse, type Universe } from '@yumia/shared';
import {
  classifyGooglePlace,
  hasGroceryNameEvidence,
  hasGroceryType,
  hasTobaccoNameEvidence,
  KEYWORD_NAME_HINTS,
  KEYWORD_UNIVERSES,
  nameSupportsUniverse,
} from '../modules/places/providers/place-types';

const prisma = new PrismaClient();

const PAGE = 2000;
const SAMPLES = 4;

/**
 * Univers que l'ancienne recherche remplissait avec des types appartenant à
 * d'autres (`bar` pour Pubs, `park` pour Randonnée, `clothing_store` +
 * `department_store` pour Shopping, `national_park` pour Parcs,
 * `performing_arts_theater` pour Sorties culturelles…) : rejugés sur leurs
 * types. Les autres univers ne bougent que sur une preuve par le nom.
 */
const REJUDGED_UNIVERSES = new Set<Universe>([
  'pub', 'live_music', 'dessert', 'tea_house', 'juice_bar',
  'park', 'hiking', 'botanical_garden', 'picnic_area', 'waterspot',
  'yoga_studio', 'tanning_studio', 'mental_health', 'alternative_medicine',
  'shopping', 'vintage_store', 'cultural_outing', 'tourist_activity', 'fuel',
  'supermarket', 'grocery_store',
]);

/** Univers où le lieu devrait être rangé. */
export function targetUniverse(place: { name: string; universe: string; tags: string[] }): Universe {
  const current = place.universe as Universe;
  // `requested: current` : sans type reconnu ni indice de nom, on ne touche à rien.
  const byEvidence = classifyGooglePlace({ name: place.name, types: place.tags, requested: current });

  // Univers disparu de l'app (art_gallery, market, cheese_shop…) : on range.
  if (!isUniverse(current)) return byEvidence;

  // Preuves par le nom, valables partout.
  if (byEvidence === 'tobacco' && hasTobaccoNameEvidence(place.name)) return 'tobacco';
  if ((byEvidence === 'supermarket' || byEvidence === 'grocery_store')
    && hasGroceryType(place.tags) && hasGroceryNameEvidence(place.name)) {
    return byEvidence;
  }

  if (current === 'tobacco') {
    if (hasTobaccoNameEvidence(place.name)) return 'tobacco';
    // Versé là par l'ancienne recherche « convenience_store » : une épicerie.
    return hasGroceryType(place.tags)
      ? classifyGooglePlace({ name: place.name, types: place.tags, requested: 'grocery_store' })
      : 'tobacco';
  }

  if (KEYWORD_UNIVERSES.has(current)) {
    if (!KEYWORD_NAME_HINTS[current]) {
      // Rangé là par sa recherche textuelle : on la rejoue. Seul le nom peut
      // le déplacer (un « Tabac » en chicha reste en chicha, une « Épicerie »
      // remontée par la recherche tabac repart en épiceries).
      return classifyGooglePlace({ name: place.name, types: place.tags, requested: current, forced: true });
    }
    return nameSupportsUniverse(place.name, current) ? current : byEvidence;
  }
  return REJUDGED_UNIVERSES.has(current) ? byEvidence : current;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');

  const moves = new Map<string, { ids: string[]; samples: string[] }>();
  let examined = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.place.findMany({
      where: { provider: 'google' },
      select: { id: true, name: true, universe: true, tags: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    examined += page.length;
    for (const place of page) {
      const target = targetUniverse(place);
      if (target === place.universe) continue;
      const key = `${place.universe} → ${target}`;
      const move = moves.get(key) ?? { ids: [], samples: [] };
      move.ids.push(place.id);
      if (move.samples.length < SAMPLES) move.samples.push(place.name);
      moves.set(key, move);
    }
  }

  const total = [...moves.values()].reduce((n, m) => n + m.ids.length, 0);
  console.log(`${examined} lieux Google examinés, ${total} à reclasser.\n`);
  for (const [key, move] of [...moves.entries()].sort((a, b) => b[1].ids.length - a[1].ids.length)) {
    console.log(`${String(move.ids.length).padStart(6)}  ${key}   ex. ${move.samples.join(' | ')}`);
  }
  if (!appliquer) {
    console.log('\nRelancer avec --appliquer pour reclasser.');
    return;
  }

  let done = 0;
  for (const [key, move] of moves) {
    const target = key.split(' → ')[1] as Universe;
    for (let i = 0; i < move.ids.length; i += 500) {
      const lot = await prisma.place.updateMany({
        where: { id: { in: move.ids.slice(i, i + 500) } },
        data: { universe: target },
      });
      done += lot.count;
    }
  }
  console.log(`\n${done} lieu(x) reclassé(s).`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
