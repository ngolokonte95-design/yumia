import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { SocialService } from './social.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('social/follow/:userId')
  follow(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.social.follow(user.sub, targetId);
  }

  @Delete('social/follow/:userId')
  unfollow(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) targetId: string) {
    return this.social.unfollow(user.sub, targetId);
  }

  @Get('social/feed')
  getFeed(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.social.getSocialFeed(user.sub, limit ? parseInt(limit, 10) : 30);
  }

  @Get('social/users/search')
  searchUsers(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.social.searchUsers(q ?? '', limit ? parseInt(limit, 10) : 20);
  }

  @Get('social/users/:userId')
  getProfile(@CurrentUser() user: JwtPayload, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.social.getPublicProfile(userId, user.sub);
  }

  @Get('social/users/:userId/followers')
  getFollowers(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.social.getFollowers(userId);
  }

  @Get('social/users/:userId/following')
  getFollowing(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.social.getFollowing(userId);
  }
}
