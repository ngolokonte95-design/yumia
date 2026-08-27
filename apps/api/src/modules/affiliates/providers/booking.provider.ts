import { Injectable } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';

/**
 * Booking.com Affiliate Partner Program.
 * Lien de recherche géolocalisé (pas de recherche par identifiant d'hôtel —
 * on n'a pas de mapping lieu YUMIA ↔ hôtel Booking, donc on pointe vers une
 * recherche centrée sur les coordonnées du lieu, filtrée sur son nom/ville).
 * AID = identifiant d'affilié Booking.com (créé à l'inscription au programme).
 */
@Injectable()
export class BookingProvider implements AffiliateProvider {
  readonly key = 'booking' as const;
  readonly universes = ['hotel', 'camping', 'campground', 'car_rental'] as const;

  private get aid(): string | undefined {
    return process.env.BOOKING_AFFILIATE_ID;
  }

  isConfigured(): boolean {
    return !!this.aid;
  }

  generateBookingLink(place: Pick<Place, 'id' | 'name' | 'city' | 'lat' | 'lng'>, trackingId: string): string | null {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams({
      aid: this.aid!,
      label: trackingId, // repris tel quel dans les rapports Booking.com
      ss: place.name,
      latitude: String(place.lat),
      longitude: String(place.lng),
    });
    return `https://www.booking.com/searchresults.html?${params.toString()}`;
  }
}
