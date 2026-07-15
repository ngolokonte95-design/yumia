import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [PrismaModule, AuthModule, ChatModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
