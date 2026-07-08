import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { StreakCronService } from './streak-cron.service';
import { DailyDigestCronService } from './daily-digest-cron.service';
import { SavedPlacesCronService } from './saved-places-cron.service';

@Global()
@Module({
  providers: [NotificationsService, StreakCronService, DailyDigestCronService, SavedPlacesCronService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
