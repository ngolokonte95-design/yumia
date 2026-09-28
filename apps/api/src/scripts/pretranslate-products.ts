/**
 * Pré-traduit les produits les plus vus de la boutique, dans toutes les langues.
 *
 * La traduction se fait sinon à la demande (ProductTranslationService) : le
 * tout premier visiteur d'un rayon dans une langue le voit en français. Ce
 * script prend les produits mis en avant et les meilleures ventes, et demande
 * dès maintenant leur traduction à AliExpress, pour qu'un client étranger
 * trouve l'accueil et les meilleures ventes déjà traduits.
 *
 * Reprise possible à tout moment : ce qui est déjà traduit est sauté.
 * Neuf traductions par produit (sv, zh et hi réutilisent l'anglais).
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/pretranslate-products.js                (300 produits, toutes les langues)
 *   node dist/scripts/pretranslate-products.js --limit=100
 *   node dist/scripts/pretranslate-products.js --langs=en,es,de
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { ProductTranslationService } from '../modules/shop/product-translation.service';

/** Une langue par traduction stockée : sv, zh et hi utilisent celle de 'en'. */
const DEFAULT_LANGS = ['en', 'es', 'pt', 'ar', 'nl', 'it', 'de', 'pl', 'ru'];
/** Appels AliExpress simultanés : jeton partagé avec SPORTIA, on reste sobre. */
const CONCURRENCY = 3;

async function main(): Promise<void> {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const limit = Math.max(1, Math.min(2000, Number(arg('limit') ?? 300)));
  const langs = (arg('langs') ?? DEFAULT_LANGS.join(',')).split(',').map((l) => l.trim()).filter(Boolean);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const products = await app.get(PrismaService).product.findMany({
      where: { status: 'active', aliexpressProductId: { not: null } },
      orderBy: [{ featured: 'desc' }, { salesCount: 'desc' }, { rating: 'desc' }],
      take: limit,
      select: { id: true },
    });
    const translator = app.get(ProductTranslationService);
    const jobs = products.flatMap((p) => langs.map((l) => ({ id: p.id, locale: l })));
    console.log(`${products.length} produits × ${langs.length} langues = ${jobs.length} traductions à vérifier.`);

    const counts = { done: 0, cached: 0, failed: 0 };
    let next = 0;
    const started = Date.now();
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        counts[await translator.translateNow(job.id, job.locale)]++;
        const n = counts.done + counts.cached + counts.failed;
        if (n % 100 === 0 || n === jobs.length) {
          const min = ((Date.now() - started) / 60000).toFixed(1);
          console.log(`${n}/${jobs.length} · traduites ${counts.done} · déjà là ${counts.cached} · indisponibles ${counts.failed} · ${min} min`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log('Terminé.');
  } finally {
    await app.close();
  }
}

void main();
