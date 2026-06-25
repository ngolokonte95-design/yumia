import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../infra/storage/storage.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { PLACES_PROVIDER, type PlacesProvider } from './providers/places-provider.interface';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { NullPlacesProvider } from './providers/null-places.provider';

/**
 * Module des lieux (POI). Importe `AuthModule` pour réutiliser `JwtAuthGuard`.
 * Le fournisseur externe (hydratation mondiale) est choisi à l'amorçage selon
 * la config : Google si une clé est présente ET l'hydratation activée, sinon
 * un provider inactif (comportement 100 % local, inchangé).
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [PlacesController],
  providers: [
    PlacesService,
    {
      provide: PLACES_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PlacesProvider => {
        const places = config.get<{ provider: string; googleApiKey: string; hydrate: boolean }>('places');
        if (places?.provider === 'google' && places.googleApiKey && places.hydrate) {
          new Logger('PlacesModule').log('Fournisseur de lieux : Google Places (hydratation active)');
          return new GooglePlacesProvider(places.googleApiKey);
        }
        return new NullPlacesProvider();
      },
    },
  ],
  exports: [PlacesService],
})
export class PlacesModule {}
