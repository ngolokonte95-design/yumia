import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { assertClean } from '../../common/moderation/moderation';

import type { CreateReviewDto } from './dto/create-review.dto';

export type { CreateReviewDto };

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPlace(placeId: string) {
    const [reviews, agg] = await Promise.all([
      this.prisma.placeReview.findMany({
        where: { placeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.placeReview.aggregate({
        where: { placeId },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);

    // Enrichit les reviews avec les infos utilisateur (displayName, photoUrl)
    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true, plan: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return {
      reviews: reviews.map((r) => ({ ...r, user: userMap[r.userId] ?? null })),
      avgRating: agg._avg.rating ?? 0,
      total: agg._count.id,
    };
  }

  async upsert(placeId: string, userId: string, dto: CreateReviewDto) {
    assertClean(dto.body);
    const place = await this.prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
    if (!place) throw new NotFoundException(`Place ${placeId} introuvable`);

    const review = await this.prisma.placeReview.upsert({
      where: { placeId_userId: { placeId, userId } },
      update: { rating: dto.rating, body: dto.body ?? null, photoUrl: dto.photoUrl ?? null },
      create: { placeId, userId, rating: dto.rating, body: dto.body, photoUrl: dto.photoUrl },
    });
    await this.syncPlaceRating(placeId);
    return review;
  }

  /**
   * `Place.rating` est la moyenne des avis YUMIA — plus la note Google, qu'on
   * ne demande plus. Recalculée à chaque avis posé, modifié ou retiré : c'est
   * elle que lisent les listes, le classement des recommandations et la carte.
   */
  private async syncPlaceRating(placeId: string): Promise<void> {
    const agg = await this.prisma.placeReview.aggregate({ where: { placeId }, _avg: { rating: true } });
    const rating = Math.round((agg._avg.rating ?? 0) * 10) / 10;
    await this.prisma.place.update({ where: { id: placeId }, data: { rating } });
  }

  async delete(placeId: string, userId: string) {
    const existing = await this.prisma.placeReview.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });
    if (!existing) throw new NotFoundException('Avis introuvable');
    if (existing.userId !== userId) throw new ForbiddenException();
    const deleted = await this.prisma.placeReview.delete({ where: { placeId_userId: { placeId, userId } } });
    await this.syncPlaceRating(placeId);
    return deleted;
  }

  async getMyReview(placeId: string, userId: string) {
    return this.prisma.placeReview.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });
  }
}
