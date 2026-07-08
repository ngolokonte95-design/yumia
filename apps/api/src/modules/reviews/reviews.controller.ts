import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService, type CreateReviewDto } from './reviews.service';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('places/:placeId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** GET /api/places/:placeId/reviews — liste des avis + note moyenne. */
  @Get()
  getForPlace(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.reviews.getForPlace(placeId);
  }

  /** POST /api/places/:placeId/reviews — créer ou mettre à jour son avis (1 par user). */
  @Post()
  @UseGuards(JwtAuthGuard)
  upsert(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: CreateReviewDto,
    @Req() req: AuthRequest,
  ) {
    return this.reviews.upsert(placeId, req.user.sub, dto);
  }

  /** GET /api/places/:placeId/reviews/me — mon avis sur ce lieu. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyReview(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.reviews.getMyReview(placeId, req.user.sub);
  }

  /** DELETE /api/places/:placeId/reviews/me — supprimer mon avis. */
  @Delete('me')
  @UseGuards(JwtAuthGuard)
  delete(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.reviews.delete(placeId, req.user.sub);
  }
}
