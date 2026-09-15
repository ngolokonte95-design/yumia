import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ModerationService } from './moderation.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { StorageModule } from '../../infra/storage/storage.module';

@Module({
  imports: [PrismaModule, AuthModule, AffiliatesModule, StorageModule],
  controllers: [AdminController],
  providers: [AdminService, ModerationService],
  exports: [AdminService, ModerationService],
})
export class AdminModule {}
