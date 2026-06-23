import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Place as PrismaPlace } from '@prisma/client';
import { PLAN_LIMITS, isUniverse, type Place, type PriceTier, type Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

const SAVED_IDS_CACHE_TTL_SECONDS = 30;

export interface SavedPlaceResponse {
  savedAt: Date;
  listName: string;
  place: Place;
}

@Injectable()
export class SavedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async save(userId: string, placeId: string, listName = 'a_essayer'): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');

    if (user.plan === 'free') {
      const count = await this.prisma.savedPlace.count({ where: { userId } });
      const limit = PLAN_LIMITS.free.savedPlacesMax;
      if (count >= limit) {
        throw new ForbiddenException(
          `Limite de ${limit} lieux atteinte. Passe à YUMIA Plus pour sauvegarder sans limite.`,
        );
      }
    }

    await this.prisma.savedPlace.upsert({
      where: { userId_placeId_listName: { userId, placeId, listName } },
      create: { userId, placeId, listName },
      update: {},
    });
    void this.redis.del(`saved:ids:${userId}`).catch(() => undefined);
  }

  async unsave(userId: string, placeId: string): Promise<void> {
    await this.prisma.savedPlace.deleteMany({ where: { userId, placeId } });
    void this.redis.del(`saved:ids:${userId}`).catch(() => undefined);
  }

  async list(userId: string): Promise<SavedPlaceResponse[]> {
    const records = await this.prisma.savedPlace.findMany({
      where: { userId },
      include: { place: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => ({
      savedAt: r.createdAt,
      listName: r.listName,
      place: toDomainPlace(r.place),
    }));
  }

  async savedIds(userId: string): Promise<string[]> {
    const idsKey = `saved:ids:${userId}`;
    const cached = await this.redis.getJson<string[]>(idsKey).catch(() => null);
    if (cached) return cached;

    const records = await this.prisma.savedPlace.findMany({
      where: { userId },
      select: { placeId: true },
    });
    const ids = records.map((r) => r.placeId);

    void this.redis.setJson(idsKey, ids, SAVED_IDS_CACHE_TTL_SECONDS).catch(() => undefined);
    return ids;
  }
}

function toDomainPlace(p: PrismaPlace): Place {
  return {
    id: p.id,
    name: p.name,
    universe: isUniverse(p.universe) ? p.universe : (p.universe as Universe),
    location: { lat: p.lat, lng: p.lng },
    city: p.city,
    countryCode: p.countryCode,
    rating: p.rating,
    priceTier: Math.min(4, Math.max(1, p.priceTier)) as PriceTier,
    photoUrls: p.photoUrls,
    tags: p.tags,
  };
}
