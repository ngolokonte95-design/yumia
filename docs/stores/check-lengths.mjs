/**
 * Vérifie que chaque texte des fiches stores tient dans sa limite.
 *
 * Apple tronque sans prévenir et Google refuse le formulaire : un dépassement
 * se découvre au pire moment, au moment de coller. Ce script lit directement
 * FICHES-STORES.md — les blocs de code sous chaque titre « (max N) » — donc il
 * ne peut pas se désynchroniser du texte réellement publié.
 *
 *   node docs/stores/check-lengths.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, 'FICHES-STORES.md'), 'utf8');

// Un titre « ### … (max 170) » suivi, plus bas, d'un bloc ```…```.
const pattern = /^###\s+(.+?)\(max\s+(\d+)[^)]*\)\s*$\n+```\n([\s\S]*?)\n```/gm;

let ok = 0;
let failed = 0;
for (const [, label, max, body] of md.matchAll(pattern)) {
  const length = body.trim().length;
  const limit = Number(max);
  const over = length > limit;
  if (over) failed++;
  else ok++;
  const state = over ? `DÉPASSE de ${length - limit}` : `${limit - length} restants`;
  console.log(`${over ? '✗' : '✓'} ${label.trim().padEnd(34)} ${String(length).padStart(4)}/${limit}  ${state}`);
}

console.log(`\n${ok} conformes, ${failed} à corriger.`);
process.exit(failed > 0 ? 1 : 0);
