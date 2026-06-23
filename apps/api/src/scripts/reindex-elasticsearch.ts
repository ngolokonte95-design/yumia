/**
 * Réindexe tous les lieux de PostgreSQL vers Elasticsearch.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/reindex-elasticsearch.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { ElasticsearchService } from '../infra/elasticsearch/elasticsearch.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  const prisma = app.get(PrismaService);
  const es = app.get(ElasticsearchService);

  if (!es.isAvailable) {
    console.error('Elasticsearch non disponible — vérifier ELASTICSEARCH_URL.');
    process.exit(1);
  }

  const total = await prisma.place.count();
  console.log(`Réindexation de ${total} lieux...`);

  const BATCH = 200;
  let offset = 0;
  let indexed = 0;

  while (offset < total) {
    const places = await prisma.place.findMany({ skip: offset, take: BATCH });
    await Promise.all(places.map((p) => es.indexPlace(p)));
    indexed += places.length;
    offset += BATCH;
    process.stdout.write(`\r  ${indexed}/${total}`);
  }

  console.log(`\nRéindexation terminée — ${indexed} lieux indexés.`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
