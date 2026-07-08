import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** GET /api/chat/conversations — liste des conversations */
  @Get('conversations')
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.chat.listConversations(user.sub);
  }

  /** POST /api/chat/conversations — ouvre ou récupère une conv avec un autre user */
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  openConversation(@CurrentUser() user: JwtPayload, @Body('userId') userId: string) {
    return this.chat.getOrCreateConversation(user.sub, userId);
  }

  /** GET /api/chat/conversations/:id/messages?before=<iso>&limit=50 */
  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.getMessages(id, user.sub, before, limit ? parseInt(limit, 10) : 50);
  }

  /** GET /api/chat/conversations/:id/messages/poll?after=<iso> — long-polling nouveaux messages */
  @Get('conversations/:id/messages/poll')
  pollMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after') after: string,
  ) {
    return this.chat.getNewMessages(id, user.sub, after);
  }

  /** POST /api/chat/conversations/:id/messages — envoyer un message */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { content: string; type?: 'text' | 'image' | 'place_share' | 'location_share'; mediaUrl?: string; placeId?: string },
  ) {
    return this.chat.sendMessage(id, user.sub, dto.content, dto.type, dto.mediaUrl, dto.placeId);
  }
}
