import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { SocialService } from './social.service';
import type { IntentType } from './social.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Follow ────────────────────────────────────────────────────────────────

  @Post('social/follow/:userId')
  follow(@CurrentUser() user: JwtPayload, @Param('userId') targetId: string) {
    return this.social.follow(user.sub, targetId);
  }

  @Delete('social/follow/:userId')
  unfollow(@CurrentUser() user: JwtPayload, @Param('userId') targetId: string) {
    return this.social.unfollow(user.sub, targetId);
  }

  // ── Comptes privés & demandes d'abonnement ─────────────────────────────────

  @Patch('social/profile/privacy')
  setPrivacy(@CurrentUser() user: JwtPayload, @Body() dto: { isPrivate: boolean }) {
    return this.social.setPrivacy(user.sub, !!dto.isPrivate);
  }

  @Get('social/follow-requests')
  listFollowRequests(@CurrentUser() user: JwtPayload) {
    return this.social.listFollowRequests(user.sub);
  }

  @Patch('social/follow-requests/:id')
  respondToRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: { accept: boolean },
  ) {
    return this.social.respondToRequest(user.sub, id, !!dto.accept);
  }

  // ── Feed & profiles ───────────────────────────────────────────────────────

  @Get('social/feed')
  getFeed(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.social.getSocialFeed(user.sub, limit ? parseInt(limit, 10) : 30);
  }

  @Get('social/users/search')
  searchUsers(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.social.searchUsers(q ?? '', limit ? parseInt(limit, 10) : 20);
  }

  @Get('social/users/:userId/followers')
  getFollowers(@Param('userId') userId: string) {
    return this.social.getFollowers(userId);
  }

  @Get('social/users/:userId/following')
  getFollowing(@Param('userId') userId: string) {
    return this.social.getFollowing(userId);
  }

  @Get('social/users/:userId')
  getProfile(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.social.getPublicProfile(userId, user.sub);
  }

  // ── Intent signals ────────────────────────────────────────────────────────

  @Put('social/intent')
  async setIntent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { lat: number; lng: number; intent: IntentType; universe?: string; note?: string; durationHours: number },
  ) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { displayName: true, photoUrl: true, level: true },
    });
    return this.social.setIntent(user.sub, {
      displayName:   me?.displayName ?? 'Utilisateur',
      photoUrl:      me?.photoUrl    ?? undefined,
      level:         me?.level       ?? 1,
      lat:           dto.lat,
      lng:           dto.lng,
      intent:        dto.intent,
      universe:      dto.universe,
      note:          dto.note,
      durationHours: dto.durationHours,
    });
  }

  @Delete('social/intent')
  async clearIntent(@CurrentUser() user: JwtPayload) {
    await this.social.clearIntent(user.sub);
    return { status: 'ok' };
  }

  @Get('social/intent/me')
  getMyIntent(@CurrentUser() user: JwtPayload) {
    return this.social.getMyIntent(user.sub);
  }

  @Get('social/intents/nearby')
  getNearbyIntents(
    @CurrentUser() user: JwtPayload,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    return this.social.getNearbyIntents(parseFloat(lat), parseFloat(lng), radius ? parseFloat(radius) : 5, user.sub);
  }

  // ── Social Events ─────────────────────────────────────────────────────────

  @Post('social/events')
  async createEvent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { lat: number; lng: number; universe?: string; title: string; note?: string; scheduledAt: string; maxPeople?: number },
  ) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { displayName: true, photoUrl: true },
    });
    return this.social.createEvent(user.sub, {
      displayName: me?.displayName ?? 'Utilisateur',
      photoUrl:    me?.photoUrl    ?? undefined,
      ...dto,
    });
  }

  @Get('social/events/nearby')
  getNearbyEvents(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    return this.social.getNearbyEvents(parseFloat(lat), parseFloat(lng), radius ? parseFloat(radius) : 10);
  }

  @Post('social/events/:id/join')
  joinEvent(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.social.joinEvent(id, user.sub);
  }

  @Delete('social/events/:id/leave')
  leaveEvent(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.social.leaveEvent(id, user.sub);
  }

  // ── Découverte publique ───────────────────────────────────────────────────

  @Get('social/discover')
  async discoverNearby(
    @CurrentUser() user: JwtPayload,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const nearby = await this.social.discoverNearby(
      parseFloat(lat), parseFloat(lng), radius ? parseFloat(radius) : 5, user.sub,
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
