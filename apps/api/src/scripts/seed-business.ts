/**
 * Seed YUMIA Business — guides locaux certifiés + établissements boostés avec
 * un événement de billetterie. Permet aux écrans Guides et Billets d'afficher
 * du contenu réel en dev / démo.
 *
 * Usage :  npx ts-node -r tsconfig-paths/register src/scripts/seed-business.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type GuideSeed = {
  name: string;
  city: string;
  countryCode: string;
  certified: boolean;
  pricePerPerson: number;
  rating: number;
  bio: string;
};

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

const GUIDES: GuideSeed[] = [
  { name: 'Camille Rousseau', city: 'Paris', countryCode: 'FR', certified: true, pricePerPerson: 35, rating: 4.9, bio: 'Guide-conférencière diplômée. Paris secret, passages couverts et street-art du 11e.' },
  { name: 'Hugo Mercier', city: 'Paris', countryCode: 'FR', certified: true, pricePerPerson: 28, rating: 4.7, bio: 'Balades gastronomiques : marchés, fromagers et caves de Montmartre.' },
  { name: 'Léa Fontaine', city: 'Paris', countryCode: 'FR', certified: false, pricePerPerson: 20, rating: 4.5, bio: 'Photographe locale. Je t\'emmène shooter les plus beaux spots au lever du soleil.' },
  { name: 'Marco Bianchi', city: 'Lyon', countryCode: 'FR', certified: true, pricePerPerson: 30, rating: 4.8, bio: 'Traboules de la Croix-Rousse et bouchons lyonnais avec un vrai gone.' },
  { name: 'Sophie Garnier', city: 'Marseille', countryCode: 'FR', certified: true, pricePerPerson: 32, rating: 4.8, bio: 'Randonnées dans les Calanques au départ du Vieux-Port. Niveau débutant à confirmé.' },
  { name: 'James Carter', city: 'London', countryCode: 'GB', certified: true, pricePerPerson: 40, rating: 4.9, bio: 'Hidden London: Victorian pubs, Soho stories and rooftop views.' },
  { name: 'Núria Pons', city: 'Barcelona', countryCode: 'ES', certified: true, pricePerPerson: 27, rating: 4.7, bio: 'Modernisme, tapas y barrios escondidos. Gaudí como nunca lo viste.' },
];

const VENUES: VenueSeed[] = [
  { name: 'Rex Club', city: 'Paris', countryCode: 'FR', boostLevel: 3, eventName: 'Techno All Night — Live', daysFromNow: 3, ticketPrice: 22 },
  { name: 'Le Petit Bain', city: 'Paris', countryCode: 'FR', boostLevel: 2, eventName: 'Concert Indie & Rooftop', daysFromNow: 5, ticketPrice: 18 },
  { name: 'Sucre', city: 'Lyon', countryCode: 'FR', boostLevel: 2, eventName: 'Soirée House sur les toits', daysFromNow: 6, ticketPrice: 20 },
  { name: 'Le Trabendo', city: 'Paris', countryCode: 'FR', boostLevel: 1, eventName: 'DJ Set + Showcase', daysFromNow: 8, ticketPrice: 25 },
  { name: 'Razzmatazz', city: 'Barcelona', countryCode: 'ES', boostLevel: 3, eventName: 'International DJ Night', daysFromNow: 4, ticketPrice: 24 },
  { name: 'Fabric', city: 'London', countryCode: 'GB', boostLevel: 3, eventName: 'Saturday Sessions', daysFromNow: 2, ticketPrice: 28 },
];

async function main() {
  console.log('🌱 Seed business (guides + venues)…');

  // Idempotent : on repart propre (tables annexes, sans impact sur les Places).
  await prisma.guideBooking.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.guide.deleteMany({});
  await prisma.venue.deleteMany({});

  await prisma.guide.createMany({ data: GUIDES });
  console.log(`  ✓ ${GUIDES.length} guides`);

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
