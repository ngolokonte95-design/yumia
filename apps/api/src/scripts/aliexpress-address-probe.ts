/**
 * Affiche les régions qu'AliExpress accepte pour un pays.
 *
 * Lecture seule. Sert à trouver la valeur exacte à transmettre dans
 * `logistics_address.province` — cf. `AliExpressService.probeAddress`.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/aliexpress-address-probe.js FR
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AliExpressService } from '../modules/shop/aliexpress.service';

async function main(): Promise<void> {
  const pays = (process.argv[2] ?? 'FR').toUpperCase();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const resultats = await app.get(AliExpressService).probeAddress(pays);
    for (const { essai, response } of resultats) {
      const json = JSON.stringify(response);
      // Une liste de régions complète est longue : le début suffit à voir
      // si la méthode existe et sous quelle forme elle nomme les régions.
      console.log(`\n── ${essai} (${json.length} caractères) ──\n${json.slice(0, 2500)}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
