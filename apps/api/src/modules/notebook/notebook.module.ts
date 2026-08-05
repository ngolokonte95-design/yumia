import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotebookController } from './notebook.controller';
import { NotebookService } from './notebook.service';

@Module({
  imports: [AuthModule],
  controllers: [NotebookController],
  providers: [NotebookService],
})
export class NotebookModule {}
