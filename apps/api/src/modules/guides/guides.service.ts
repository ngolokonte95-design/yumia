import { Injectable, NotFoundException } from '@nestjs/common';
import type { Guide, GuideBooking } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { BookGuideDto } from './dto/book-guide.dto';

/** Commission YUMIA prélevée sur chaque réservation de guide. */
export const GUIDE_COMMISSION_RATE = 0.2;

/**
 * Guides de randonnée locaux certifiés. La commission (20%) est calculée et
 * persistée à la réservation. ⚠️ L'encaissement réel (Stripe) reste à brancher
 * — la réservation est créée en statut `pending`.
 */
@Injectable()
export class GuidesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Guides certifiés d'une ville, mieux notés en premier. */
  listByCity(city: string, limit = 20): Promise<Guide[]> {
    return this.prisma.guide.findMany({
      where: { city: { equals: city, mode: 'insensitive' } },
      orderBy: [{ certified: 'desc' }, { rating: 'desc' }],
      take: limit,
    });
  }

  async book(userId: string | null, dto: BookGuideDto): Promise<GuideBooking> {
    const guide = await this.prisma.guide.findUnique({ where: { id: dto.guideId } });
    if (!guide) {
      throw new NotFoundException('Guide introuvable.');
    }

    const totalPrice = round2(guide.pricePerPerson * dto.people);
    const commission = round2(totalPrice * GUIDE_COMMISSION_RATE);

    // TODO Stripe : encaisser puis reverser le net au guide, statut → confirmed.
    return this.prisma.guideBooking.create({
      data: {
        guideId: dto.guideId,
        userId,
        date: new Date(dto.date),
        people: dto.people,
        totalPrice,
        commission,
        status: 'pending',
      },
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
