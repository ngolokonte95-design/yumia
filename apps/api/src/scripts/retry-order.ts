/**
 * Reprend une commande payée qu'AliExpress a refusée.
 *
 * Le webhook Stripe laisse une telle commande en `paid`, avec dans les logs
 * « payée mais non transmise à AliExpress — reprise manuelle nécessaire ».
 * Ce script est cette reprise : il diagnostique l'adresse figée dans la
 * commande, la corrige si besoin, puis retransmet la commande.
 *
 * Par défaut, lecture seule. Le diagnostic n'affiche ni le nom, ni l'adresse,
 * ni le téléphone du client — seulement ce qui ne va pas —, pour que la sortie
 * puisse être partagée sans exposer ses données.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/retry-order.js YUM-E2EE26
 *   node dist/scripts/retry-order.js YUM-E2EE26 --nom="Marie Dupont" --envoyer
 *   node dist/scripts/retry-order.js YUM-E2EE26 --telephone="0612345678" --envoyer
 *
 *   --nom=…        remplace le nom du destinataire dans la commande
 *   --telephone=…  remplace son téléphone
 *   --region=…     force la région transmise à AliExpress (sinon déduite du code postal)
 *   --envoyer      retransmet à AliExpress (sinon : diagnostic seulement)
 */
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { OrdersService } from '../modules/shop/orders.service';
import {
  aliexpressProvince,
  normalizeRecipientName,
  phoneProblem,
  recipientNameProblem,
} from '../modules/shop/address-rules';

function option(nom: string, args: string[]): string | null {
  const arg = args.find((a) => a.startsWith(`--${nom}=`));
  return arg ? arg.slice(nom.length + 3) : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reference = args.find((a) => !a.startsWith('--'))?.toUpperCase();
  const nouveauNom = option('nom', args);
  const nouveauTelephone = option('telephone', args);
  const regionForcee = option('region', args);
  const envoyer = args.includes('--envoyer');

  if (!reference) {
    console.error('Usage : node dist/scripts/retry-order.js <référence> [--nom=…] [--telephone=…] [--envoyer]');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const orders = app.get(OrdersService);

  try {
    const order = await prisma.order.findUnique({ where: { reference }, include: { items: true } });
    if (!order) {
      console.error(`Commande ${reference} introuvable.`);
      process.exitCode = 1;
      return;
    }

    const adresse = { ...(order.addressSnapshot as Record<string, string>) };
    console.log(`Commande ${order.reference} — statut : ${order.status}`);
    console.log(`  payée le : ${order.paidAt?.toISOString() ?? '—'}`);
    console.log(`  commande AliExpress : ${order.aliexpressOrderId ?? 'aucune'}`);
    console.log(`  articles : ${order.items.length}, dont ${order.items.filter((i) => i.aliexpressProductId).length} AliExpress`);

    if (nouveauNom !== null) adresse['fullName'] = normalizeRecipientName(nouveauNom);
    if (nouveauTelephone !== null) adresse['phone'] = nouveauTelephone.trim();
    if (regionForcee !== null) adresse['aliexpressProvince'] = regionForcee.trim();

    const mots = normalizeRecipientName(adresse['fullName'] ?? '').split(' ').filter(Boolean).length;
    const problemeNom = recipientNameProblem(adresse['fullName']);
    const problemeTel = phoneProblem(adresse['phone'], adresse['countryCode']);
    console.log(`  nom du destinataire : ${mots} mot(s) — ${problemeNom ? 'À CORRIGER' : 'conforme'}`);
    console.log(`  téléphone : ${problemeTel ? 'À CORRIGER' : 'conforme'}`);
    // La région n'est pas une donnée sensible à ce niveau de détail, et c'est
    // précisément la valeur qu'il faut pouvoir lire pour diagnostiquer un refus.
    const region = adresse['aliexpressProvince'] || aliexpressProvince(adresse);
    console.log(`  région transmise : ${region || 'AUCUNE'}${adresse['aliexpressProvince'] ? ' (forcée)' : ''}`);

    if (problemeNom || problemeTel) {
      console.log(`\n${problemeNom ?? problemeTel}`);
      console.log('Corrige avec --nom=… ou --telephone=…, puis relance avec --envoyer.');
      return;
    }

    if (!envoyer) {
      console.log('\nAdresse conforme. Relance avec --envoyer pour transmettre la commande à AliExpress.');
      return;
    }

    if (order.status !== 'paid') {
      console.error(`\nRefus : seule une commande « paid » se retransmet (celle-ci est « ${order.status} »).`);
      process.exitCode = 1;
      return;
    }

    if (nouveauNom !== null || nouveauTelephone !== null || regionForcee !== null) {
      await prisma.order.update({
        where: { id: order.id },
        data: { addressSnapshot: adresse as Prisma.InputJsonValue },
      });
      console.log('\nAdresse de la commande corrigée.');
    }

    await orders.fulfill(order.id);

    const apres = await prisma.order.findUnique({ where: { id: order.id } });
    if (apres?.aliexpressOrderId) {
      console.log(`\nTransmise : commande AliExpress ${apres.aliexpressOrderId} (statut ${apres.status}).`);
      console.log("Elle doit encore être payée dans le compte AliExpress pour être expédiée.");
    } else {
      console.log(`\nToujours refusée (statut ${apres?.status}). La raison est dans le message d'erreur ci-dessus.`);
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
