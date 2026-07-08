import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeetupService } from './meetup.service';

@Controller('meetups')
@UseGuards(JwtAuthGuard)
export class MeetupController {
  constructor(private readonly meetupService: MeetupService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { title: string; description?: string; city: string; placeId?: string; date: string; maxAttendees?: number; isPublic?: boolean },
  ) {
    return this.meetupService.createMeetup(req.user.id, body);
  }

  @Get()
  list(@Req() req: any, @Query('city') city?: string, @Query('limit') limit?: string) {
    return this.meetupService.listMeetups(city, limit ? +limit : 30, req.user.id);
  }

  @Get('mine')
  mine(@Req() req: any) {
    return this.meetupService.getMyMeetups(req.user.id);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.meetupService.getMeetup(id, req.user.id);
  }

  @Post(':id/rsvp')
  rsvp(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'going' | 'interested' | 'cancel' }) {
    return this.meetupService.rsvp(id, req.user.id, body.status);
  }
}
