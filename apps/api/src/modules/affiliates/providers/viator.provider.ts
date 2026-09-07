import { Injectable, Logger } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';
import { normalizeTitle, titleMatchesPlace } from './title-match.util';

const DESTINATIONS_TTL_MS = 24 * 60 * 60 * 1000; // le référentiel de villes Viator change rarement

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

  // Cache en mémoire du référentiel de villes Viator (GET /partner/destinations,
  // ~3400 entrées, ~1,2 Mo) — indispensable : `filtering.destination` exige un
  // ID numérique Viator, pas un nom de ville (confirmé par appel réel à l'API,
  // qui répond "Invalid destination: not a number" sinon). Rechargé une fois
  // par jour maximum, jamais à chaque vérification.
  private destinationsById: Map<string, number> | null = null;
  private destinationsFetchedAt = 0;

  private async loadDestinations(): Promise<Map<string, number>> {
    if (this.destinationsById && Date.now() - this.destinationsFetchedAt < DESTINATIONS_TTL_MS) {
      return this.destinationsById;
    }
    const res = await fetch('https://api.viator.com/partner/destinations', {
      headers: { Accept: 'application/json;version=2.0', 'Accept-Language': 'fr-FR', 'exp-api-key': this.apiKey! },
    });
    if (!res.ok) throw new Error(`GET /destinations → ${res.status}`);
    const data = (await res.json()) as { destinations?: { destinationId: number; name: string }[] };
    const map = new Map<string, number>();
    for (const d of data.destinations ?? []) {
      const key = normalizeTitle(d.name);
      if (!map.has(key)) map.set(key, d.destinationId); // premier arrivé (généralement la ville la plus notoire) gardé
    }
    this.destinationsById = map;
    this.destinationsFetchedAt = Date.now();
    return map;
  }

  /**
   * Interroge la recherche de produits Viator pour confirmer qu'une activité
   * correspondant au nom du lieu existe réellement — sinon le lien de
   * recherche générique renvoie une page sans rapport avec ce lieu.
   *
   * Deux conditions non négociables côté API (confirmées par appel réel,
   * sinon HTTP 400) : `currency` et `filtering.destination` — ce dernier est
   * un ID Viator, pas un nom de ville, d'où le passage par loadDestinations()
   * ci-dessus. Une ville absente du référentiel Viator (ex. Cergy) n'a
   * simplement aucune activité Viator : on masque plutôt que de laisser
   * passer par défaut (c'était exactement le bug remonté — la requête
   * précédente échouait silencieusement et laissait tout passer).
   *
   * `searchTerm` seul ne filtre pas assez précisément (vérifié : une recherche
   * "Tour Eiffel" dans Paris remonte d'abord des visites du Louvre) — on
   * récupère donc plusieurs résultats et on vérifie qu'un titre réel
   * correspond au lieu, même logique que GetYourGuideProvider.
   *
   * Best-effort : une erreur réseau/API (pas une ville introuvable, un cas
   * différent et attendu) laisse passer le lieu plutôt que de le masquer à tort.
   */
  async verifyListing(place: Pick<Place, 'name' | 'city'>): Promise<boolean> {
    if (!this.apiKey) return true;
    try {
      const destinations = await this.loadDestinations();
      const destinationId = place.city ? destinations.get(normalizeTitle(place.city)) : undefined;
      if (!destinationId) return false; // ville absente du référentiel Viator → aucune activité possible

      const res = await fetch('https://api.viator.com/partner/products/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json;version=2.0',
          'Accept-Language': 'fr-FR',
          'exp-api-key': this.apiKey,
        },
        body: JSON.stringify({
          searchTerm: place.name,
          currency: 'EUR',
          filtering: { destination: String(destinationId) },
          searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: 20 } }],
        }),
      });
      if (!res.ok) {
        this.logger.warn(`verifyListing: réponse ${res.status} — lieu laissé visible.`);
        return true;
      }
      const data = (await res.json()) as { products?: { title?: string; productName?: string }[] };
      const products = data.products ?? [];
      return products.some((p) => titleMatchesPlace(p.title ?? p.productName ?? '', place.name));
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
