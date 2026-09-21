/**
 * Retire complètement un rayon : ses produits, puis le rayon lui-même.
 *
 * Sûr pour l'historique des commandes : `OrderItem.productId` est en
 * `onDelete: SetNull`, et chaque ligne garde un instantané (titre, image,
 * prix, identifiant AliExpress) indépendant du produit — une commande déjà
 * passée reste lisible même si son produit a disparu du catalogue depuis.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/retire-shop-category.js soiree-karaoke
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ShopImportService } from '../modules/shop/shop-import.service';

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage : node dist/scripts/retire-shop-category.js <slug>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const imports = app.get(ShopImportService);
    const { productsDeleted } = await imports.retireCategory(slug);
    console.log(`Rayon ${slug} retiré — ${productsDeleted} produit(s) supprimé(s) du catalogue.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
