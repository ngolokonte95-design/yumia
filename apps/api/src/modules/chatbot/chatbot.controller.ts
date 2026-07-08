import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ChatbotService } from './chatbot.service';

@Controller('chatbot')
@UseGuards(JwtAuthGuard)
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('message')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ) {
    return this.chatbot.chat(user.sub, dto.message, dto.history ?? []);
  }
}
