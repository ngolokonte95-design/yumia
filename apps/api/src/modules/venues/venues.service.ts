import { Injectable } from '@nestjs/common';
import type { Venue } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Partenariats établissements : boost payant des suggestions.
 * Le boost (1-3) remonte un établissement en priorité dans les recommandations
 * tant que `boostExpiresAt` n'est pas dépassé.
 */
@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Établissements actuellement boostés, triés par niveau de boost décroissant. */
  boosted(limit = 20): Promise<Venue[]> {
    return this.prisma.venue.findMany({
      where: {
        boostLevel: { gt: 0 },
        OR: [{ boostExpiresAt: null }, { boostExpiresAt: { gt: new Date() } }],
      },
      orderBy: [{ boostLevel: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }
}
