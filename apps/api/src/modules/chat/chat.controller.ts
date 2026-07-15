import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { MessageType } from '@prisma/client';
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

  /** POST /api/chat/conversations/group — créer un groupe de discussion */
  @Post('conversations/group')
  createGroup(@CurrentUser() user: JwtPayload, @Body() dto: { userIds: string[]; title: string }) {
    return this.chat.createGroup(user.sub, dto.userIds ?? [], dto.title);
  }

  /** POST /api/chat/conversations/:id/participants — ajouter des membres au groupe */
  @Post('conversations/:id/participants')
  addParticipants(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { userIds: string[] },
  ) {
    return this.chat.addParticipants(id, user.sub, dto.userIds ?? []);
  }

  /** DELETE /api/chat/conversations/:id/leave — quitter un groupe */
  @Delete('conversations/:id/leave')
  leaveGroup(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.leaveGroup(id, user.sub);
  }

  /** POST /api/chat/conversations/:id/messages — envoyer un message.
   *  Compatibilité : accepte aussi `audioUrl`/`duration` (anciens noms côté mobile). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      content: string; type?: MessageType; mediaUrl?: string; placeId?: string;
      postId?: string; storyId?: string; replyToId?: string; oneTime?: boolean;
      durationSec?: number;
      // alias historiques envoyés par le mobile
      audioUrl?: string; duration?: number;
    },
  ) {
    return this.chat.sendMessage(id, user.sub, {
      content: dto.content,
      type: dto.type,
      mediaUrl: dto.mediaUrl ?? dto.audioUrl,
      placeId: dto.placeId,
      postId: dto.postId,
      storyId: dto.storyId,
      replyToId: dto.replyToId,
      oneTime: dto.oneTime,
      durationSec: dto.durationSec ?? dto.duration,
    });
  }

  /** POST /api/chat/messages/:id/react — réaction emoji (toggle) */
  @Post('messages/:id/react')
  react(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { emoji: string },
  ) {
    return this.chat.toggleReaction(id, user.sub, dto.emoji);
  }

  /** POST /api/chat/messages/:id/viewed-once — consommer un média vue unique */
  @Post('messages/:id/viewed-once')
  viewedOnce(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markOneTimeViewed(id, user.sub);
  }
}
