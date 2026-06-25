import type { PlacesProvider, ProviderPlace } from './places-provider.interface';

/**
 * Provider inactif : utilisé quand aucune clé n'est configurée (ou hydratation
 * désactivée). `isEnabled = false` court-circuite toute hydratation côté service.
 */
export class NullPlacesProvider implements PlacesProvider {
  readonly isEnabled = false;
  async searchNearby(): Promise<ProviderPlace[]> {
    return [];
  }
}
