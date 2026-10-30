import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsDeclineController } from './calls-decline.controller';
import { CallsService } from './calls.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [CallsController, CallsDeclineController],
  providers: [CallsService],
})
export class CallsModule {}
