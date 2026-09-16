/**
 * Affiche les « provinces » qu'AliExpress accepte pour un pays.
 *
 * Lecture seule. Sert à trouver la valeur exacte à transmettre dans
 * `logistics_address.province` — cf. `AliExpressService.probeAddress`.
 *
 * Premier constat (16/09/2026) : pour la France, les provinces d'AliExpress
 * sont des départements, pas des régions — d'où le refus de « Ile-de-France ».
 * La réponse brute fait 2,3 millions de caractères (toutes les communes) :
 * ce script la résume.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/aliexpress-address-probe.js FR
 *   node dist/scripts/aliexpress-address-probe.js FR --villes="Val d'Oise"
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AliExpressService } from '../modules/shop/aliexpress.service';

interface Noeud {
  name?: string;
  type?: string;
  hasChildren?: boolean;
  children?: Noeud[];
}

async function main(): Promise<void> {
  const pays = (process.argv[2] ?? 'FR').toUpperCase();
  const optionVilles = process.argv.find((a) => a.startsWith('--villes='))?.slice('--villes='.length);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const [premier] = await app.get(AliExpressService).probeAddress(pays);
    const data = (premier?.response as any)?.aliexpress_ds_address_get_response?.result?.data;
    if (!data?.children) {
      console.log('Réponse inattendue :', JSON.stringify(premier?.response).slice(0, 800));
      return;
    }

    const provinces: Noeud[] = typeof data.children === 'string' ? JSON.parse(data.children) : data.children;
    console.log(`${provinces.length} provinces pour ${pays} :\n`);
    for (const p of provinces) {
      const villes = p.children ?? [];
      console.log(`  [${p.type ?? '?'}] ${p.name}  (${villes.length} villes)`);
    }

    // Échantillon de villes : leur orthographe dira si AliExpress valide aussi
    // la ville contre sa liste, et sous quelle forme.
    const cible = optionVilles
      ? provinces.find((p) => p.name?.toLowerCase() === optionVilles.toLowerCase())
      : provinces[0];
    if (cible) {
      const noms = (cible.children ?? []).map((v) => v.name);
      console.log(`\nVilles de « ${cible.name} » (${noms.length}), extrait :`);
      console.log(`  ${noms.slice(0, 40).join(' | ')}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
