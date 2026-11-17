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
 * Règles :
 *  - univers « mot-clé » rempli par une vraie recherche textuelle (chicha,
 *    coffeeshop, opticien…) : le lieu y reste, sauf si son nom dit « tabac » ;
 *  - univers « mot-clé » que l'ancienne recherche par type avait pollué
 *    (rooftop, brunch, lingerie… : `KEYWORD_NAME_HINTS`) : le lieu n'y reste
 *    que si son nom le justifie ;
 *  - tous les autres : l'univers que donnent le nom et les types.
 * Seuls les lieux importés de Google sont touchés (les types sont dans `tags`).
 *
 * Lecture seule par défaut — il faut `--appliquer` pour écrire.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/reclassify-places.js
 *   node dist/scripts/reclassify-places.js --appliquer
 */
import { PrismaClient } from '@prisma/client';
import type { Universe } from '@yumia/shared';
import {
  classifyGooglePlace,
  KEYWORD_NAME_HINTS,
  KEYWORD_UNIVERSES,
  nameSupportsUniverse,
} from '../modules/places/providers/place-types';

const prisma = new PrismaClient();

const PAGE = 2000;
const SAMPLES = 4;

/** Univers où le lieu devrait être rangé. */
export function targetUniverse(place: { name: string; universe: string; tags: string[] }): Universe {
  const current = place.universe as Universe;
  // `requested: current` : sans type reconnu ni indice de nom, on ne touche à rien.
  const byEvidence = classifyGooglePlace({ name: place.name, types: place.tags, requested: current });

  if (KEYWORD_UNIVERSES.has(current)) {
    if (!KEYWORD_NAME_HINTS[current]) {
      // Rangé là par sa recherche textuelle : on la rejoue. Seul le nom peut
      // le déplacer (un « Tabac » en chicha reste en chicha, une « Épicerie »
      // remontée par la recherche tabac repart en épiceries).
      return classifyGooglePlace({ name: place.name, types: place.tags, requested: current, forced: true });
    }
    return nameSupportsUniverse(place.name, current) ? current : byEvidence;
  }
  return byEvidence;
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
