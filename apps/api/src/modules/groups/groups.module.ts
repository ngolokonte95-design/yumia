import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { GroupsCleanupCron } from './groups-cleanup.cron';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthModule, RecommendationsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsCleanupCron],
})
export class GroupsModule {}
