import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { LocationService, LocationVisibility } from './location.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(
    private readonly locationSvc: LocationService,
    private readonly prisma: PrismaService,
  ) {}

  /** PUT /api/location/me — met à jour ma position (appelé en background toutes les 30s) */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Put('me')
  updateLocation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { lat: number; lng: number; visibility?: LocationVisibility },
  ) {
    return this.locationSvc.updateLocation(user.sub, dto.lat, dto.lng, dto.visibility);
  }

  /** DELETE /api/location/me — se rendre invisible */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hideLocation(@CurrentUser() user: JwtPayload) {
    await this.locationSvc.hideLocation(user.sub);
  }

  /** GET /api/location/nearby?lat=&lng=&radius=5 — utilisateurs proches visibles */
  @Get('nearby')
  async getNearby(
    @CurrentUser() user: JwtPayload,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const follows = await this.prisma.follow.findMany({ where: { followerId: user.sub }, select: { followingId: true } });
    const followingIds = follows.map((f) => f.followingId);

    const nearby = await this.locationSvc.getNearbyUsers(
      parseFloat(lat),
      parseFloat(lng),
      radius ? parseFloat(radius) : 5,
      user.sub,
      followingIds,
    );

    if (!nearby.length) return [];

    const userIds = nearby.map((n) => n.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, photoUrl: true, bio: true, level: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return nearby.map((n) => ({ ...n, user: userMap[n.userId] ?? null }));
  }
}
