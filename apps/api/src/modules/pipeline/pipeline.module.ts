import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { MenuAiHandler } from './handlers/menu-ai.handler';
import { EventsHandler } from './handlers/events.handler';
import { PrismaModule } from '../../infra/prisma/prisma.module';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [PipelineController],
  providers: [PipelineService, MenuAiHandler, EventsHandler],
  exports: [PipelineService],
})
export class PipelineModule {}
