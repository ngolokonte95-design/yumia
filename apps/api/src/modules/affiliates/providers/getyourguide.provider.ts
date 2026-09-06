import { Injectable } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';

/**
 * GetYourGuide Partner Program.
 * Lien de recherche par mot-clé (nom du lieu + ville) — pas de mapping vers
 * un identifiant d'activité GetYourGuide précis, comme pour Booking.com.
 */
@Injectable()
export class GetYourGuideProvider implements AffiliateProvider {
  readonly key = 'getyourguide' as const;
  readonly universes = ['tourist_activity', 'cultural_outing', 'museum', 'monument', 'zoo', 'amusement_park'] as const;

  private get partnerId(): string | undefined {
    return process.env.GETYOURGUIDE_PARTNER_ID;
  }

  isConfigured(): boolean {
    return !!this.partnerId;
  }

  // TODO(affiliates): implémenter verifyListing() une fois l'accès à la
  // GetYourGuide Partner API obtenu (clé distincte du partner_id actuel,
  // à demander sur partner.getyourguide.com — l'endpoint exact de recherche
  // est communiqué dans la doc fournie à l'approbation, pas de spec publique
  // stable à deviner ici). Sans implémentation, verifyListing est absent :
  // le contrat par défaut (AffiliateProvider.verifyListing) laisse passer
  // tous les lieux, comportement actuel inchangé — voir viator.provider.ts
  // pour le modèle à suivre une fois la clé en main.

  generateBookingLink(place: Pick<Place, 'id' | 'name' | 'city' | 'lat' | 'lng'>, trackingId: string): string | null {
    if (!this.isConfigured()) return null;
    const query = place.city ? `${place.name} ${place.city}` : place.name;
    const params = new URLSearchParams({
      q: query,
      partner_id: this.partnerId!,
      cmp: trackingId, // repris tel quel dans les rapports GetYourGuide
    });
    return `https://www.getyourguide.com/s/?${params.toString()}`;
  }
}
