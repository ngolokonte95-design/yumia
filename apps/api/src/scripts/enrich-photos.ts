/**
 * Enrichit les lieux dépourvus de photos (typiquement les lieux seed) en
 * récupérant leurs vraies photos via Google Places (Text Search), stockées sous
 * forme d'URL pointant vers le proxy `/api/places/photo` (la clé reste serveur).
 *
 * Idempotent : ne touche que les lieux dont `photoUrls` est vide.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/enrich-photos.js
 * Requiert GOOGLE_PLACES_API_KEY et API_PUBLIC_BASE_URL dans l'environnement.
 */

import { PrismaClient } from '@prisma/client';
import { GooglePlacesProvider } from '../modules/places/providers/google-places.provider';

const prisma = new PrismaClient();

const PHOTO_WIDTH = 800;
// Petite pause entre appels pour rester sous les quotas Google.
const DELAY_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enrich(): Promise<void> {
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? '').trim();
  const baseUrl = (process.env.API_PUBLIC_BASE_URL ?? process.env.STORAGE_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

  if (!apiKey) {
    console.error('❌ GOOGLE_PLACES_API_KEY manquant — abandon.');
    process.exit(1);
  }
  if (!baseUrl) {
    console.error('❌ API_PUBLIC_BASE_URL manquant (nécessaire pour construire les liens photo) — abandon.');
    process.exit(1);
  }

  const provider = new GooglePlacesProvider(apiKey);

  const places = await prisma.place.findMany({
    where: { photoUrls: { isEmpty: true } },
    select: { id: true, name: true, city: true, lat: true, lng: true },
  });

  console.log(`🖼️  ${places.length} lieux sans photo à enrichir…`);

  let enriched = 0;
  let missed = 0;

  for (const p of places) {
    try {
      const refs = await provider.findPhotoRefs(`${p.name} ${p.city}`, p.lat, p.lng);
      if (refs.length === 0) {
        missed++;
        continue;
      }
      const photoUrls = refs.map(
        (ref) => `${baseUrl}/api/places/photo?ref=${encodeURIComponent(ref)}&w=${PHOTO_WIDTH}`,
      );
      await prisma.place.update({ where: { id: p.id }, data: { photoUrls } });
      enriched++;
      if (enriched % 10 === 0) console.log(`   …${enriched} enrichis`);
    } catch (err) {
      missed++;
      console.warn(`   ⚠️  ${p.name} (${p.city}) : ${(err as Error).message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`✅ Terminé : ${enriched} enrichis, ${missed} sans correspondance.`);
}

enrich()
  .catch((err) => {
    console.error('❌ Enrichissement échoué :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
