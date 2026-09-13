/**
 * Suppression définitive d'un ou plusieurs comptes, par adresse e-mail.
 *
 * Pourquoi un script plutôt qu'un `DELETE FROM "User"` : une vingtaine de
 * tables (posts, stories, likes, commentaires, blocages, conversations…)
 * portent un `userId` en colonne brute, sans relation Prisma — un DELETE SQL
 * les laisserait orphelines, sans erreur, et en contradiction avec ce que
 * l'app promet à l'utilisateur. `AuthService.deleteAccount` nettoie chaque
 * table dans une transaction ; ce script ne fait que l'appeler, pour qu'il
 * n'existe jamais deux versions de cette logique.
 *
 * Sert aussi aux demandes de suppression RGPD reçues par courriel, quand la
 * personne n'a plus accès à son compte pour le faire depuis l'app.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/delete-user.js a@exemple.fr b@exemple.fr   # aperçu
 *   node dist/scripts/delete-user.js a@exemple.fr --yes          # exécution
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../modules/auth/auth.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { isAdminEmail } from '../modules/auth/is-admin-email';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const emails = args.filter((a) => !a.startsWith('--')).map((e) => e.trim().toLowerCase());

  if (!emails.length) {
    console.error('Aucune adresse fournie.');
    console.error('Usage : node dist/scripts/delete-user.js <email…> [--yes]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });

    const missing = emails.filter((e) => !users.some((u) => u.email === e));
    for (const email of missing) {
      console.log(`introuvable : ${email}`);
    }

    // Garde-fou : un compte administrateur ne se supprime pas par mégarde au
    // milieu d'une liste. Il faut le sortir de la liste sciemment.
    const admins = users.filter((u) => isAdminEmail(u.email));
    if (admins.length) {
      console.error(`\nRefus : ${admins.map((u) => u.email).join(', ')} est administrateur.`);
      process.exit(2);
    }

    if (!users.length) {
      console.log('\nRien à supprimer.');
      return;
    }

    console.log(`\n${users.length} compte(s) visé(s) :`);
    for (const u of users) {
      console.log(`  ${u.email} — ${u.displayName} — créé le ${u.createdAt.toISOString().slice(0, 10)}`);
    }

    if (!confirmed) {
      console.log('\nAperçu seulement. Relance avec --yes pour supprimer définitivement.');
      return;
    }

    for (const u of users) {
      await auth.deleteAccount(u.id);
      console.log(`supprimé : ${u.email}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
