/**
 * Quelle méthode AliExpress donne le suivi d'une commande ?
 *
 * Interroge les méthodes candidates (`AliExpressService.probeTrackingMethods`)
 * avec une VRAIE commande déjà transmise, et affiche ce que chacune répond.
 * Lecture seule : rien n'est modifié, ni chez AliExpress ni en base.
 *
 * Les données personnelles (nom, adresse, téléphone, e-mail…) sont masquées
 * avant affichage : la sortie peut être partagée pour l'analyse.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/aliexpress-tracking-probe.js              (dernière commande transmise)
 *   node dist/scripts/aliexpress-tracking-probe.js YUM-XXXXXX   (une référence précise)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AliExpressService } from '../modules/shop/aliexpress.service';
import { PrismaService } from '../infra/prisma/prisma.service';

/** Clés dont la valeur est une donnée personnelle, masquée à l'affichage. */
const PERSONAL = /name|address|addr|phone|mobile|tel|mail|zip|post|contact|city|province|street|receiver|buyer_login|login_id/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        PERSONAL.test(k) && (typeof v === 'string' || typeof v === 'number') ? '•••' : redact(v),
      ]),
    );
  }
  return value;
}

async function main(): Promise<void> {
  const reference = process.argv[2]?.trim();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const order = await app.get(PrismaService).order.findFirst({
      where: reference ? { reference } : { aliexpressOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { reference: true, status: true, aliexpressOrderId: true, createdAt: true },
    });
    if (!order?.aliexpressOrderId) {
      console.log(reference ? `Commande ${reference} introuvable ou jamais transmise à AliExpress.` : 'Aucune commande transmise à AliExpress.');
      return;
    }
    console.log(`Commande ${order.reference} (${order.status}, ${order.createdAt.toISOString().slice(0, 10)})`);

    const ae = app.get(AliExpressService);
    for (const aeId of order.aliexpressOrderId.split(',').map((s) => s.trim()).filter(Boolean)) {
      console.log(`\n=== Commande AliExpress ${aeId} ===`);
      for (const { method, response } of await ae.probeTrackingMethods(aeId)) {
        const text = JSON.stringify(redact(response));
        console.log(`\n--- ${method} (${text.length} caractères)`);
        console.log(text.length > 3000 ? `${text.slice(0, 3000)}…` : text);
      }
    }
  } finally {
    await app.close();
  }
}

void main();
