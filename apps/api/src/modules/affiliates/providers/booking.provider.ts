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

  // Pas de verifyListing() prévu ici : la recherche géolocalisée en temps réel
  // (Booking.com Demand API) est réservée aux gros partenaires à fort volume,
  // hors de portée pour ce programme d'affiliation. Le lien reste une
  // recherche par ville/coordonnées — l'hôtellerie a un taux de couverture
  // Booking.com bien plus élevé que les petites activités locales (GYG/Viator),
  // donc le faux-positif y est nettement plus rare.

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

  // Booking.com regroupe hôtels, voitures et vols sous un même compte
  // affilié — un seul provider suffit pour les 3 onglets génériques
  // correspondants. `vertical` sélectionne la page d'accueil du bon produit
  // (pas de terme de recherche libre pertinent ici, contrairement à
  // GetYourGuide/Viator — Booking n'a pas de recherche par mot-clé générique).
  private static readonly GENERIC_PATHS: Record<string, string> = {
    cars: 'cars/index.html',
    flights: 'flights/index.html',
  };

  /** Lien générique (page d'accueil hôtels/voitures/vols selon `vertical`, l'utilisateur choisit sa destination). */
  generateGenericLink(trackingId: string, vertical?: string): string | null {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams({ aid: this.aid!, label: trackingId });
    const path = (vertical && BookingProvider.GENERIC_PATHS[vertical]) || 'index.html';
    return `https://www.booking.com/${path}?${params.toString()}`;
  }
}
