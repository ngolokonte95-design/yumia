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
