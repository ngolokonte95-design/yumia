/**
 * Recalcule `Product.salesCount` à partir des commandes réellement expédiées.
 *
 * Pourquoi : jusqu'au 22/09/2026, l'import recopiait le nombre de ventes
 * AliExpress sur la fiche produit. Ce sont les ventes d'un autre vendeur, et
 * les afficher comme les nôtres est une pratique commerciale trompeuse
 * (directive Omnibus (UE) 2019/2161) — même raison que le prix barré inventé,
 * retiré le 15/09. L'import met désormais ce compteur à zéro ; ce script
 * rattrape ce qui est déjà en base.
 *
 * Ne remet pas bêtement tout à zéro : il ressomme les quantités des commandes
 * expédiées ou livrées, pour ne pas effacer nos ventes réelles au passage.
 * `orders.service.ts` incrémente au passage en `shipped`, d'où ces deux états.
 *
 * Lecture seule par défaut — il faut `--appliquer` pour écrire.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/recompute-sales.js
 *   node dist/scripts/recompute-sales.js --appliquer
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');

  const reelles = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { not: null }, order: { status: { in: ['shipped', 'delivered'] } } },
    _sum: { quantity: true },
  });
  const parProduit = new Map(
    reelles.map((r) => [r.productId as string, r._sum.quantity ?? 0]),
  );

  const produits = await prisma.product.findMany({
    where: { salesCount: { gt: 0 } },
    select: { id: true, title: true, salesCount: true },
  });

  const aCorriger = produits
    .map((p) => ({ ...p, reel: parProduit.get(p.id) ?? 0 }))
    .filter((p) => p.reel !== p.salesCount);

  if (aCorriger.length === 0) {
    console.log('Rien à corriger : les compteurs reflètent déjà les commandes expédiées.');
    return;
  }

  const total = aCorriger.reduce((s, p) => s + p.salesCount, 0);
  const conserve = aCorriger.reduce((s, p) => s + p.reel, 0);
  console.log(
    `${aCorriger.length} produit(s) affichent ${total} vente(s) dont ${conserve} seulement sont les nôtres.`,
  );
  for (const p of aCorriger.slice(0, 8)) {
    console.log(`   · ${p.salesCount} → ${p.reel}  ${p.title.slice(0, 80)}`);
  }
  if (aCorriger.length > 8) console.log(`   … et ${aCorriger.length - 8} autre(s)`);

  if (!appliquer) {
    console.log('\nRelancer avec --appliquer pour corriger.');
    return;
  }

  // Un `updateMany` par valeur cible plutôt qu'un update par produit : la
  // quasi-totalité retombe sur 0, donc une seule requête suffit pour eux.
  const parValeur = new Map<number, string[]>();
  for (const p of aCorriger) {
    parValeur.set(p.reel, [...(parValeur.get(p.reel) ?? []), p.id]);
  }
  let corriges = 0;
  for (const [valeur, ids] of parValeur) {
    for (let i = 0; i < ids.length; i += 500) {
      const lot = await prisma.product.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        data: { salesCount: valeur },
      });
      corriges += lot.count;
    }
  }
  console.log(`\n${corriges} compteur(s) corrigé(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
