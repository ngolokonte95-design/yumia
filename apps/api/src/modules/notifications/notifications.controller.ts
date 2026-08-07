import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** GET /api/notifications — liste paginée (curseur), les plus récentes d'abord. */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(user.sub, { cursor, limit: limit ? +limit : undefined });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.notifications.unreadCount(user.sub) };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    await this.notifications.markRead(user.sub, id);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.notifications.markAllRead(user.sub);
  }
}
