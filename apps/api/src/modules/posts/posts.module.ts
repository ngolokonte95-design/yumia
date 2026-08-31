import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { VideoTranscodeService } from '../../infra/media/video-transcode.service';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [PostsController],
  providers: [PostsService, VideoTranscodeService],
  exports: [PostsService],
})
export class PostsModule {}
