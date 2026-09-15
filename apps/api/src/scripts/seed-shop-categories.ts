/**
 * Crée ou met à jour les rayons de la boutique à partir de SHOP_CATEGORIES.
 *
 * Même effet que `POST /shop/admin/categories/seed`, sans avoir à se procurer
 * un jeton administrateur : ajouter un rayon se fait alors d'une commande,
 * depuis le serveur, juste après le déploiement.
 *
 * Idempotent — un rayon existant est mis à jour (nom, icône, ordre), jamais
 * dupliqué. Ne supprime rien : un rayon retiré de SHOP_CATEGORIES survit en
 * base jusqu'à `DELETE /shop/admin/categories/:slug`, qui emporte aussi ses
 * produits et mérite donc de rester une action explicite.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/seed-shop-categories.js
 */
import { PrismaClient } from '@prisma/client';
import { SHOP_CATEGORIES } from '../modules/shop/shop-categories';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;

  // Deux passes, comme ShopImportService.seedCategories : un sous-rayon peut
  // précéder son parent dans la liste, et le rattacher au vol échouerait sur
  // un parent qui n'existe pas encore.
  for (const c of SHOP_CATEGORIES) {
    const existing = await prisma.shopCategory.findUnique({ where: { slug: c.slug } });
    const data = {
      nameFr: c.nameFr,
      emoji: c.emoji,
      universe: c.universe ?? null,
      sortOrder: c.sortOrder,
    };
    if (existing) {
      await prisma.shopCategory.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.shopCategory.create({ data: { slug: c.slug, ...data } });
      created += 1;
      console.log(`  + ${c.emoji} ${c.nameFr}`);
    }
  }

  for (const c of SHOP_CATEGORIES) {
    if (!c.parentSlug) continue;
    const parent = await prisma.shopCategory.findUnique({
      where: { slug: c.parentSlug },
      select: { id: true },
    });
    if (!parent) {
      console.warn(`Rayon parent introuvable pour ${c.slug} : ${c.parentSlug}`);
      continue;
    }
    await prisma.shopCategory.update({ where: { slug: c.slug }, data: { parentId: parent.id } });
  }

  console.log(`\n${created} rayon(s) créé(s), ${updated} mis à jour.`);

  // Un rayon sans produit n'apparaît pas dans la boutique : le dire ici évite
  // de chercher pourquoi la grille n'a pas changé après le seed.
  const vides = await prisma.shopCategory.findMany({
    where: { products: { none: {} } },
    select: { nameFr: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (vides.length > 0) {
    console.log(
      `\n${vides.length} rayon(s) encore sans produit, donc invisibles dans l'app :\n  ` +
        vides.map((v) => v.nameFr).join('\n  ') +
        `\n\nLancer l'import pour les remplir.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
