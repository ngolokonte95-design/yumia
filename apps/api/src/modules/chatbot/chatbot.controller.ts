import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ChatbotService } from './chatbot.service';
import { Quota } from '../../common/quota/quota.interceptor';
import { ChatbotMessageDto } from './dto/chatbot-message.dto';

@Controller('chatbot')
@UseGuards(JwtAuthGuard)
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('message')
  @Quota({ name: 'chatbot', feature: 'chatbotPerDay' })
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatbotMessageDto,
  ) {
    return this.chatbot.chat(user.sub, dto.message, dto.history ?? [], { city: dto.city });
  }
}
