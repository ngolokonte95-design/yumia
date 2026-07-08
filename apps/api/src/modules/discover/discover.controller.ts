import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiscoverService } from './discover.service';

@Controller('discover')
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  @Get('world-map')
  worldMap(@Req() req: any) {
    return this.discoverService.getWorldMapUsers(req.user.id);
  }

  @Get('swipe')
  swipe(
    @Req() req: any,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('limit') limit?: string,
  ) {
    return this.discoverService.getSwipeProfiles(req.user.id, +lat, +lng, limit ? +limit : 10);
  }

  @Post('swipe/:userId/seen')
  markSeen(@Req() req: any, @Param('userId') userId: string) {
    return this.discoverService.markSeen(req.user.id, userId);
  }

  @Post('encounter')
  checkEncounter(
    @Req() req: any,
    @Body() body: { placeId: string; lat: number; lng: number },
  ) {
    return this.discoverService.checkEncounters(req.user.id, body.placeId, body.lat, body.lng);
  }

  @Get('encounters')
  myEncounters(@Req() req: any, @Query('limit') limit?: string) {
    return this.discoverService.getMyEncounters(req.user.id, limit ? +limit : 20);
  }
}
