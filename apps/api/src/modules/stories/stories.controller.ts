import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { StoriesService } from './stories.service';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get('feed')
  getFeed(@CurrentUser() user: JwtPayload) {
    return this.stories.getFeedStories(user.sub);
  }

  /** GET /stories/global — barre de stories « Pour vous » (tous les utilisateurs). */
  @Get('global')
  getGlobal(@CurrentUser() user: JwtPayload) {
    return this.stories.getGlobalStories(user.sub);
  }

  // ── Stories à la une (highlights) ─────────────────────────────────────────

  @Get('highlights/:userId')
  getHighlights(@Param('userId') userId: string) {
    return this.stories.getUserHighlights(userId);
  }

  @Post('highlights')
  createHighlight(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { title: string; items: Array<{ mediaUrl: string; type?: 'photo' | 'video'; caption?: string }> },
  ) {
    return this.stories.createHighlight(user.sub, dto.title, dto.items ?? []);
  }

  @Post('highlights/:id/items')
  addHighlightItem(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { mediaUrl: string; type?: 'photo' | 'video'; caption?: string },
  ) {
    return this.stories.addItemToHighlight(user.sub, id, dto);
  }

  @Delete('highlights/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHighlight(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.stories.deleteHighlight(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { mediaUrl: string; type?: 'photo' | 'video'; caption?: string; placeId?: string },
  ) {
    return this.stories.create(user.sub, dto);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async view(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.stories.markViewed(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.stories.delete(id, user.sub);
  }
}
