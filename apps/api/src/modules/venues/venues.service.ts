import { Injectable } from '@nestjs/common';
import type { Venue } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async boosted(params: {
    limit?: number;
    lat?: number;
    lng?: number;
    radius?: number;
  }): Promise<Venue[]> {
    const { limit = 20, lat, lng, radius = 50_000 } = params;

    const candidates = await this.prisma.venue.findMany({
      where: {
        boostLevel: { gt: 0 },
        OR: [{ boostExpiresAt: null }, { boostExpiresAt: { gt: new Date() } }],
      },
      orderBy: [{ boostLevel: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    if (lat == null || lng == null) {
      return candidates.slice(0, limit);
    }

    // Un venue sans coordonnées ne peut pas être vérifié comme proche : on
    // l'exclut plutôt que de le traiter par défaut comme "à proximité".
    // Pas de repli global non plus — sinon dès qu'aucun venue n'est réellement
    // proche, on affichait les mieux boostés du monde entier (bug rapporté :
    // « lieux partout dans le monde » au lieu d'être filtré par région).
    const nearby = candidates.filter(
      (v) => v.lat != null && v.lng != null && haversineM(lat, lng, v.lat, v.lng) <= radius,
    );

    return nearby.slice(0, limit);
  }
}
