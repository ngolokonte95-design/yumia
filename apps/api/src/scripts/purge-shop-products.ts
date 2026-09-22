/**
 * Archive les produits en catalogue que les filtres de leur rayon ne
 * reconnaissent plus.
 *
 * Pourquoi ce script : les filtres d'un rayon ne s'appliquent qu'à l'import.
 * Resserrer `keywords` après coup ne touche pas ce qui est déjà en base — le
 * rayon Barbier gardait ses lampadaires solaires, entrés par le mot « lampe »
 * avant qu'il ne soit retiré. L'audit les signale ; ce script les retire.
 *
 * Archive, ne supprime pas : un produit déjà commandé doit rester lisible
 * dans l'historique. `status: archived` le sort du catalogue sans toucher aux
 * commandes, et le geste se défait.
 *
 * Lecture seule par défaut — il faut `--appliquer` pour écrire.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/purge-shop-products.js
 *   node dist/scripts/purge-shop-products.js --rayon=barbier
 *   node dist/scripts/purge-shop-products.js --appliquer
 */
import { PrismaClient } from '@prisma/client';
import {
  SHOP_CATEGORIES,
  isBanned,
  isExcluded,
  isJunk,
  isRelevant,
  matchesContext,
} from '../modules/shop/shop-categories';

const prisma = new PrismaClient();

function option(nom: string, args: string[]): string | null {
  const arg = args.find((a) => a.startsWith(`--${nom}=`));
  return arg ? arg.slice(nom.length + 3) : null;
}

/** La raison du refus, ou null si le produit a toujours sa place ici. */
function refus(
  title: string,
  seed: (typeof SHOP_CATEGORIES)[number],
): string | null {
  if (isBanned(title)) return 'interdit';
  if (isExcluded(title, seed.exclude)) return 'refusé par le rayon';
  if (!matchesContext(title, seed.requireContext)) return 'hors contexte';
  if (isJunk(title, seed.keywords)) return 'camelote';
  if (!isRelevant(title, seed.keywords)) return 'aucun mot-clé';
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const appliquer = args.includes('--appliquer');
  const seulRayon = option('rayon', args);

  const produits = await prisma.product.findMany({
    where: { status: { not: 'archived' } },
    select: { id: true, title: true, category: { select: { slug: true } } },
  });

  const parSlug = new Map(SHOP_CATEGORIES.map((c) => [c.slug, c]));
  const aRetirer = new Map<string, { id: string; title: string; raison: string }[]>();

  for (const p of produits) {
    if (seulRayon && p.category.slug !== seulRayon) continue;
    const seed = parSlug.get(p.category.slug);
    if (!seed) continue;
    const raison = refus(p.title, seed);
    if (!raison) continue;
    const liste = aRetirer.get(seed.slug) ?? [];
    liste.push({ id: p.id, title: p.title, raison });
    aRetirer.set(seed.slug, liste);
  }

  let total = 0;
  for (const seed of SHOP_CATEGORIES) {
    const liste = aRetirer.get(seed.slug);
    if (!liste) continue;
    const restant =
      produits.filter((p) => p.category.slug === seed.slug).length - liste.length;
    console.log(
      `\n■ ${seed.emoji} ${seed.nameFr} [${seed.slug}] — ${liste.length} à archiver, ${restant} restant(s)`,
    );
    for (const r of liste.slice(0, 5)) {
      console.log(`   · [${r.raison}] ${r.title.slice(0, 90)}`);
    }
    if (liste.length > 5) console.log(`   … et ${liste.length - 5} autre(s)`);
    total += liste.length;
  }

  if (total === 0) {
    console.log('\nRien à archiver : tous les produits passent les filtres de leur rayon.');
    return;
  }

  if (!appliquer) {
    console.log(`\n${total} produit(s) seraient archivés. Relancer avec --appliquer pour le faire.`);
    return;
  }

  // Par paquets : un `in` de plusieurs milliers d'identifiants fait un
  // paramétrage de requête que Postgres refuse au-delà de 65 535 valeurs.
  const ids = [...aRetirer.values()].flat().map((r) => r.id);
  let count = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const lot = await prisma.product.updateMany({
      where: { id: { in: ids.slice(i, i + 500) } },
      data: { status: 'archived' },
    });
    count += lot.count;
  }
  console.log(`\n${count} produit(s) archivé(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
