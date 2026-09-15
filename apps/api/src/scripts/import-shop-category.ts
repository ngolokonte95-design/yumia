/**
 * Remplit un rayon de la boutique depuis AliExpress.
 *
 * Même effet que `POST /shop/admin/import/:categorySlug`, sans jeton
 * administrateur à récupérer — et, contrairement à une requête HTTP, sans
 * risque de couper l'import au bout de quelques minutes : remplir un rayon
 * enchaîne une recherche puis un appel de détail par produit, ce qui dépasse
 * largement les délais d'attente habituels d'un proxy.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/import-shop-category.js peche
 *   node dist/scripts/import-shop-category.js peche ski-hiver --par-terme=4
 *   node dist/scripts/import-shop-category.js --vides --par-terme=4
 *
 * `--vides` traite tous les rayons encore sans produit.
 *
 * Relancer sur un rayon déjà rempli le complète sans le dupliquer : l'import
 * connaît les produits déjà présents, par identifiant AliExpress et par
 * ressemblance de titre.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { ShopImportService } from '../modules/shop/shop-import.service';
import { SHOP_CATEGORIES } from '../modules/shop/shop-categories';

/**
 * Combien de produits retenir par terme de recherche.
 *
 * AliExpress renvoie les mieux classés d'un terme : en prendre dix sur
 * « canne à pêche télescopique » donne dix cannes quasi identiques. Quatre
 * reste le compromis retenu par l'import — assez pour remplir, assez peu pour
 * que le rayon ne se répète pas.
 */
const PAR_TERME_DEFAUT = 4;

function nombreApres(prefixe: string, args: string[]): number | null {
  const arg = args.find((a) => a.startsWith(prefixe));
  if (!arg) return null;
  const n = Number.parseInt(arg.slice(prefixe.length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parTerme = nombreApres('--par-terme=', args) ?? PAR_TERME_DEFAUT;
  const tousLesVides = args.includes('--vides');
  let slugs = args.filter((a) => !a.startsWith('--'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const imports = app.get(ShopImportService);

  try {
    if (tousLesVides) {
      const vides = await prisma.shopCategory.findMany({
        where: { products: { none: {} } },
        select: { slug: true },
        orderBy: { sortOrder: 'asc' },
      });
      slugs = vides.map((v) => v.slug);
    }

    if (slugs.length === 0) {
      console.error('Aucun rayon à traiter.');
      console.error('Usage : node dist/scripts/import-shop-category.js <slug…> [--par-terme=N]');
      console.error('    ou : node dist/scripts/import-shop-category.js --vides');
      process.exitCode = 1;
      return;
    }

    // Vérifié avant de commencer : un slug mal orthographié au milieu d'une
    // liste ne doit pas se découvrir après vingt minutes d'import.
    const inconnus = slugs.filter((s) => !SHOP_CATEGORIES.some((c) => c.slug === s));
    if (inconnus.length > 0) {
      console.error(`Rayon(s) inconnu(s) : ${inconnus.join(', ')}`);
      console.error(`Rayons disponibles : ${SHOP_CATEGORIES.map((c) => c.slug).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    let total = 0;
    for (const slug of slugs) {
      const seed = SHOP_CATEGORIES.find((c) => c.slug === slug)!;
      const avant = Date.now();
      console.log(
        `\n── ${seed.emoji} ${seed.nameFr} — ${seed.searchTerms.length} termes × ${parTerme} ──`,
      );

      try {
        const r = await imports.importCategory(slug, parTerme);
        const enRayon = await prisma.product.count({ where: { category: { slug } } });
        total += r.imported;
        const secondes = Math.round((Date.now() - avant) / 1000);
        console.log(
          `${r.imported} importé(s) en ${secondes}s — ${enRayon} produit(s) en rayon.\n` +
            `  écartés : ${r.skipped.irrelevant} hors sujet, ${r.skipped.similar} trop semblables, ` +
            `${r.skipped.duplicate} déjà connus, ${r.skipped.junk} camelote, ` +
            `${r.skipped.banned} marques interdites, ${r.skipped.noPrice} sans prix`,
        );
      } catch (e) {
        // Un rayon en échec (terme sans résultat, quota AliExpress) ne doit pas
        // emporter les suivants : le reste de la liste continue.
        console.error(`Échec sur ${slug} : ${(e as Error).message}`);
      }
    }

    console.log(`\n${total} produit(s) importé(s) au total.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
