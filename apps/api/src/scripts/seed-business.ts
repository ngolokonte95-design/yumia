/**
 * Seed YUMIA Business — établissements boostés avec un événement de
 * billetterie, pour l'écran Billets en dev / démo.
 *
 * Il créait aussi des « guides locaux » : des personnes fictives, avec note et
 * label « certifié » inventés, réservables sans que la demande n'arrive à
 * personne. Retirés le 23/09/2026 — l'écran Guides liste désormais de vraies
 * visites (Viator, GetYourGuide). Le script continue de vider ces tables.
 *
 * Usage :  npx ts-node -r tsconfig-paths/register src/scripts/seed-business.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type VenueSeed = {
  name: string;
  city: string;
  countryCode: string;
  boostLevel: number;
  eventName: string;
  daysFromNow: number;
  ticketPrice: number;
  photoUrl?: string;
};

const VENUES: VenueSeed[] = [
  { name: 'Rex Club', city: 'Paris', countryCode: 'FR', boostLevel: 3, eventName: 'Techno All Night — Live', daysFromNow: 3, ticketPrice: 22 },
  { name: 'Le Petit Bain', city: 'Paris', countryCode: 'FR', boostLevel: 2, eventName: 'Concert Indie & Rooftop', daysFromNow: 5, ticketPrice: 18 },
  { name: 'Sucre', city: 'Lyon', countryCode: 'FR', boostLevel: 2, eventName: 'Soirée House sur les toits', daysFromNow: 6, ticketPrice: 20 },
  { name: 'Le Trabendo', city: 'Paris', countryCode: 'FR', boostLevel: 1, eventName: 'DJ Set + Showcase', daysFromNow: 8, ticketPrice: 25 },
  { name: 'Razzmatazz', city: 'Barcelona', countryCode: 'ES', boostLevel: 3, eventName: 'International DJ Night', daysFromNow: 4, ticketPrice: 24 },
  { name: 'Fabric', city: 'London', countryCode: 'GB', boostLevel: 3, eventName: 'Saturday Sessions', daysFromNow: 2, ticketPrice: 28 },
];

async function main() {
  console.log('🌱 Seed business (venues)…');

  // Idempotent : on repart propre (tables annexes, sans impact sur les Places).
  await prisma.guideBooking.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.guide.deleteMany({});
  await prisma.venue.deleteMany({});


  const now = Date.now();
  for (const v of VENUES) {
    await prisma.venue.create({
      data: {
        name: v.name,
        city: v.city,
        countryCode: v.countryCode,
        boostLevel: v.boostLevel,
        boostExpiresAt: new Date(now + 30 * 86_400_000),
        businessPlan: 'pro',
        commissionRate: 0.15,
        eventName: v.eventName,
        eventDate: new Date(now + v.daysFromNow * 86_400_000),
        ticketPrice: v.ticketPrice,
        photoUrl: v.photoUrl ?? null,
      },
    });
  }
  console.log(`  ✓ ${VENUES.length} venues + événements`);
  console.log('✅ Seed business terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
