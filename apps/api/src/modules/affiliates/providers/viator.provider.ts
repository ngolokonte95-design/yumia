import { Injectable, Logger } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';
import { titleMatchesPlace } from './title-match.util';

/**
 * Viator (TripAdvisor) Partner Program.
 * Lien de recherche par mot-clé — même logique que Booking.com/GetYourGuide,
 * pas de mapping vers un identifiant de produit Viator précis.
 * Format confirmé via l'outil "Créer un lien" du portail partenaire :
 * ?pid=<partnerId>&mcid=42383&medium=link
 */
@Injectable()
export class ViatorProvider implements AffiliateProvider {
  private readonly logger = new Logger(ViatorProvider.name);

  readonly key = 'viator' as const;
  readonly universes = ['tourist_activity', 'cultural_outing', 'museum', 'monument', 'zoo', 'amusement_park'] as const;

  private get partnerId(): string | undefined {
    return process.env.VIATOR_PARTNER_ID;
  }

  // Clé de la Viator Partner API (docs.viator.com) — distincte du `pid` utilisé
  // dans les liens trackés. Demandée séparément sur le portail partenaire.
  // Tant qu'elle n'est pas configurée, verifyListing() ne filtre rien (voir
  // le contrat par défaut dans AffiliateProvider.verifyListing).
  private get apiKey(): string | undefined {
    return process.env.VIATOR_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.partnerId;
  }

  /** Voir AffiliateProvider.hasWorkingVerification — utilisé uniquement par Bons Plans. */
  hasWorkingVerification(): boolean {
    return !!this.apiKey;
  }

  /**
   * Interroge la recherche de produits Viator pour confirmer qu'une activité
   * correspondant au nom du lieu existe réellement — sinon le lien de
   * recherche générique renvoie une page sans rapport avec ce lieu.
   *
   * `totalCount > 0` seul ne suffit PAS : la recherche est floue et
   * "{lieu} {ville}" remonte souvent des activités de la ville entière sans
   * rapport avec ce lieu précis (une ville avec une seule activité Viator
   * faisait "passer" n'importe quel lieu qui s'y trouve). On récupère donc
   * plusieurs résultats et on vérifie qu'un titre réel correspond au lieu —
   * même logique que GetYourGuideProvider.
   *
   * Best-effort : toute erreur (réseau, clé absente, quota) laisse passer le
   * lieu plutôt que de le masquer à tort.
   */
  async verifyListing(place: Pick<Place, 'name' | 'city'>): Promise<boolean> {
    if (!this.apiKey) return true;
    try {
      const res = await fetch('https://api.viator.com/partner/products/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json;version=2.0',
          'Accept-Language': 'fr-FR',
          'exp-api-key': this.apiKey,
        },
        body: JSON.stringify({
          searchTerm: place.city ? `${place.name} ${place.city}` : place.name,
          searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: 20 } }],
        }),
      });
      if (!res.ok) return true;
      const data = (await res.json()) as { products?: { results?: { title?: string; productName?: string }[]; totalCount?: number } };
      const results = data.products?.results;
      if (!results) {
        // Forme de réponse imprévue — on retombe sur le comptage brut plutôt
        // que de tout masquer à cause d'un champ manquant.
        return (data.products?.totalCount ?? 0) > 0;
      }
      return results.some((r) => titleMatchesPlace(r.title ?? r.productName ?? '', place.name));
    } catch (e) {
      this.logger.warn(`verifyListing indisponible (${(e as Error).message}) — lieu laissé visible.`);
      return true;
    }
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

  /** Lien générique (onglets Explorer type "Transfert aéroport") — pas de lieu, juste un mot-clé optionnel. */
  generateGenericLink(trackingId: string, searchTerm?: string): string | null {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams({
      pid: this.partnerId!,
      mcid: '42383',
      medium: 'link',
      campaign: trackingId,
    });
    if (searchTerm) {
      params.set('text', searchTerm);
      return `https://www.viator.com/searchResults/all?${params.toString()}`;
    }
    return `https://www.viator.com/?${params.toString()}`;
  }
}
