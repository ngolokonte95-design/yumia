import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DiscoverService } from './discover.service';

@Controller('discover')
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  @Get('world-map')
  worldMap(@Req() req: any, @Query('interestedIn') interestedIn?: string) {
    return this.discoverService.getWorldMapUsers(req.user.sub, interestedIn);
  }

  @Get('swipe')
  swipe(
    @Req() req: any,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('limit') limit?: string,
    @Query('interestedIn') interestedIn?: string,
  ) {
    return this.discoverService.getSwipeProfiles(req.user.sub, +lat, +lng, limit ? +limit : 10, interestedIn);
  }

  @Post('swipe/:userId/seen')
  markSeen(@Req() req: any, @Param('userId') userId: string) {
    return this.discoverService.markSeen(req.user.sub, userId);
  }

  @Post('encounter')
  checkEncounter(
    @Req() req: any,
    @Body() body: { placeId: string; lat: number; lng: number },
  ) {
    return this.discoverService.checkEncounters(req.user.sub, body.placeId, body.lat, body.lng);
  }

  @Get('encounters')
  myEncounters(@Req() req: any, @Query('limit') limit?: string) {
    return this.discoverService.getMyEncounters(req.user.sub, limit ? +limit : 20);
  }
}
