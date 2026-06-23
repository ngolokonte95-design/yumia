import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

/** Module des lieux (POI). Importe `AuthModule` pour réutiliser `JwtAuthGuard`. */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
