/**
 * Remplace les notes Google stockées dans `Place.rating` par la moyenne des
 * avis laissés par les utilisateurs de YUMIA (0 si personne n'a noté).
 *
 * Pourquoi : depuis le 23/09/2026, on ne demande plus la note à Google — ce
 * seul champ faisait payer toutes nos recherches au palier le plus cher. Les
 * lieux importés ensuite arrivent sans note ; sans ce script, les anciens
 * garderaient leur note Google et passeraient devant tous les nouveaux dans
 * les classements, et l'app afficherait deux sortes de notes mélangées.
 *
 * Lecture seule par défaut — il faut `--appliquer` pour écrire.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/reset-place-ratings.js
 *   node dist/scripts/reset-place-ratings.js --appliquer
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');

  const avis = await prisma.placeReview.groupBy({
    by: ['placeId'],
    _avg: { rating: true },
  });
  const noteYumia = new Map(avis.map((a) => [a.placeId, Math.round((a._avg.rating ?? 0) * 10) / 10]));

  const lieux = await prisma.place.findMany({
    where: { OR: [{ rating: { not: 0 } }, { id: { in: [...noteYumia.keys()] } }] },
    select: { id: true, rating: true },
  });
  const aCorriger = lieux
    .map((l) => ({ ...l, cible: noteYumia.get(l.id) ?? 0 }))
    .filter((l) => l.cible !== l.rating);

  const versZero = aCorriger.filter((l) => l.cible === 0).length;
  console.log(
    `${aCorriger.length} lieu(x) à corriger : ${versZero} perdent leur note Google, ` +
      `${aCorriger.length - versZero} prennent la note de leurs avis YUMIA.`,
  );
  if (!appliquer) {
    console.log('\nRelancer avec --appliquer pour corriger.');
    return;
  }

  const parValeur = new Map<number, string[]>();
  for (const l of aCorriger) parValeur.set(l.cible, [...(parValeur.get(l.cible) ?? []), l.id]);
  let corriges = 0;
  for (const [valeur, ids] of parValeur) {
    for (let i = 0; i < ids.length; i += 500) {
      const lot = await prisma.place.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        data: { rating: valeur },
      });
      corriges += lot.count;
    }
  }
  console.log(`\n${corriges} note(s) corrigée(s).`);
  console.log('Penser à relancer reindex-elasticsearch.js si Elasticsearch est actif.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
