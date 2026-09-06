import { Injectable, Logger } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';

/** Compare sans accents/casse — les titres GetYourGuide et nos noms de lieux
 * (Google Places) ne partagent pas forcément la même normalisation Unicode. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * GetYourGuide Partner Program.
 * Lien de recherche par mot-clé (nom du lieu + ville) — pas de mapping vers
 * un identifiant d'activité GetYourGuide précis, comme pour Booking.com.
 */
@Injectable()
export class GetYourGuideProvider implements AffiliateProvider {
  private readonly logger = new Logger(GetYourGuideProvider.name);

  readonly key = 'getyourguide' as const;
  readonly universes = ['tourist_activity', 'cultural_outing', 'museum', 'monument', 'zoo', 'amusement_park'] as const;

  private get partnerId(): string | undefined {
    return process.env.GETYOURGUIDE_PARTNER_ID;
  }

  // Clé de la GetYourGuide Partner API (code.getyourguide.com/partner-api-spec),
  // distincte du partner_id utilisé dans les liens — à demander sur
  // partner.getyourguide.com. Tant qu'elle n'est pas configurée, verifyListing()
  // ne filtre rien (comportement par défaut du contrat AffiliateProvider).
  private get apiKey(): string | undefined {
    return process.env.GETYOURGUIDE_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.partnerId;
  }

  /**
   * Interroge GET /1/tours?q=<ville> (spec publique : le paramètre `q` filtre
   * par LIEU/ville, pas par mot-clé libre sur le titre — il n'y a pas de
   * recherche texte sur les activités elles-mêmes côté GetYourGuide). On
   * récupère donc les activités de la ville, puis on vérifie qu'au moins l'une
   * a un titre correspondant au nom du lieu — approximatif par nature (comme
   * pour Viator), mais bien mieux que de ne jamais vérifier.
   * Best-effort : toute erreur laisse passer le lieu plutôt que de le masquer à tort.
   */
  async verifyListing(place: Pick<Place, 'name' | 'city'>): Promise<boolean> {
    if (!this.apiKey || !place.city) return true;
    try {
      const params = new URLSearchParams({ q: place.city, cnt_language: 'fr', limit: '100' });
      const res = await fetch(`https://api.getyourguide.com/1/tours?${params.toString()}`, {
        headers: { 'X-ACCESS-TOKEN': this.apiKey },
      });
      if (!res.ok) return true;
      const data = (await res.json()) as { data?: { tours?: { title?: string }[] } };
      const tours = data.data?.tours ?? [];
      const target = normalize(place.name);
      return tours.some((t) => {
        const title = normalize(t.title ?? '');
        return title.includes(target) || target.includes(title);
      });
    } catch (e) {
      this.logger.warn(`verifyListing indisponible (${(e as Error).message}) — lieu laissé visible.`);
      return true;
    }
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

  /** Lien générique (onglets Explorer type "Gastronomie", "Aventure"...) — pas de lieu, juste un mot-clé optionnel. */
  generateGenericLink(trackingId: string, searchTerm?: string): string | null {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams({ partner_id: this.partnerId!, cmp: trackingId });
    if (searchTerm) params.set('q', searchTerm);
    return `https://www.getyourguide.com/s/?${params.toString()}`;
  }
}
