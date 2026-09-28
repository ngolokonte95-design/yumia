/**
 * Affiche les modes de livraison qu'AliExpress propose pour un produit, et
 * celui que YUMIA choisira (le plus rapide, même payant).
 *
 * Lecture seule : aucune commande n'est passée. Sert à vérifier, avant la
 * première vraie commande, que l'API renvoie bien délais et transporteurs.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/aliexpress-shipping-probe.js            (un produit actif au hasard, France)
 *   node dist/scripts/aliexpress-shipping-probe.js <productId> [FR] [quantité]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AliExpressService } from '../modules/shop/aliexpress.service';
import { PrismaService } from '../infra/prisma/prisma.service';

async function main(): Promise<void> {
  const [argId, pays = 'FR', quantite = '1'] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ae = app.get(AliExpressService);
    let productId = argId;
    if (!productId) {
      const produit = await app.get(PrismaService).product.findFirst({
        where: { status: 'active', aliexpressProductId: { not: null } },
        select: { title: true, aliexpressProductId: true },
      });
      if (!produit?.aliexpressProductId) { console.log('Aucun produit AliExpress actif en base.'); return; }
      productId = produit.aliexpressProductId;
      console.log(`Produit : ${produit.title} (${productId})`);
    }
    const options = await ae.shippingOptions(productId, pays.toUpperCase(), Number(quantite));
    if (!options.length) {
      console.log('Aucune option lisible (voir l\'avertissement ci-dessus pour la réponse brute).');
      return;
    }
    console.table(options.map((o) => ({
      transporteur: o.serviceName,
      'délai max (j)': o.maxDays,
      'frais (€)': o.feeCents !== null ? (o.feeCents / 100).toFixed(2) : '?',
      suivi: o.tracking ? 'oui' : 'non',
    })));
    const choisi = await ae.fastestShipping(productId, pays.toUpperCase(), Number(quantite));
    console.log(`Choix YUMIA : ${choisi?.serviceName ?? 'défaut AliExpress'}`);
  } finally {
    await app.close();
  }
}

void main();
