import { Injectable } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';

/**
 * Viator (TripAdvisor) Partner Program.
 * Lien de recherche par mot-clé — même logique que Booking.com/GetYourGuide,
 * pas de mapping vers un identifiant de produit Viator précis.
 * Format confirmé via l'outil "Créer un lien" du portail partenaire :
 * ?pid=<partnerId>&mcid=42383&medium=link
 */
@Injectable()
export class ViatorProvider implements AffiliateProvider {
  readonly key = 'viator' as const;
  readonly universes = ['tourist_activity', 'cultural_outing', 'museum', 'monument', 'zoo', 'amusement_park'] as const;

  private get partnerId(): string | undefined {
    return process.env.VIATOR_PARTNER_ID;
  }

  isConfigured(): boolean {
    return !!this.partnerId;
  }

  generateBookingLink(place: Pick<Place, 'id' | 'name' | 'city' | 'lat' | 'lng'>, trackingId: string): string | null {
    if (!this.isConfigured()) return null;
    const query = place.city ? `${place.name} ${place.city}` : place.name;
    const params = new URLSearchParams({
      text: query,
      pid: this.partnerId!,
      mcid: '42383',
      medium: 'link',
      campaign: trackingId, // repris tel quel dans les rapports Viator
    });
    return `https://www.viator.com/searchResults/all?${params.toString()}`;
  }
}
