import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateReviewDto {
  rating: number;   // 1..5
  body?: string;
  photoUrl?: string;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPlace(placeId: string) {
    const [reviews, agg] = await Promise.all([
      this.prisma.placeReview.findMany({
        where: { placeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { displayName: true, photoUrl: true } } },
      }),
      this.prisma.placeReview.aggregate({
        where: { placeId },
        _avg: { rating: true },
        _count: { id: true },
      }),
    ]);
    return {
      reviews,
      avgRating: agg._avg.rating ?? 0,
      total: agg._count.id,
    };
  }

  async upsert(placeId: string, userId: string, dto: CreateReviewDto) {
    const place = await this.prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
    if (!place) throw new NotFoundException(`Place ${placeId} introuvable`);

    const review = await this.prisma.placeReview.upsert({
      where: { placeId_userId: { placeId, userId } },
      update: { rating: dto.rating, body: dto.body ?? null, photoUrl: dto.photoUrl ?? null },
      create: { placeId, userId, rating: dto.rating, body: dto.body, photoUrl: dto.photoUrl },
    });
    return review;
  }

  async delete(placeId: string, userId: string) {
    const existing = await this.prisma.placeReview.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });
    if (!existing) throw new NotFoundException('Avis introuvable');
    if (existing.userId !== userId) throw new ForbiddenException();
    return this.prisma.placeReview.delete({ where: { placeId_userId: { placeId, userId } } });
  }

  async getMyReview(placeId: string, userId: string) {
    return this.prisma.placeReview.findUnique({
      where: { placeId_userId: { placeId, userId } },
    });
  }
}
