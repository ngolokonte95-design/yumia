import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { QuestsService } from './quests.service';

@Controller('quests')
@UseGuards(JwtAuthGuard)
export class QuestsController {
  constructor(private readonly quests: QuestsService) {}

  @Get()
  getUserQuests(@CurrentUser() user: JwtPayload) {
    return this.quests.getUserQuests(user.sub);
  }
}
