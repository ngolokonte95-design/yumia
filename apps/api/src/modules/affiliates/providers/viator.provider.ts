import { Injectable, Logger } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';
import { normalizeTitle, titleMatchesPlace } from './title-match.util';

/** Une visite réelle, telle que Viator la vend — affichée par l'écran Visites guidées. */
export interface TourListing {
  provider: 'viator';
  title: string;
  imageUrl: string | null;
  /** Note des voyageurs sur Viator — réelle, et affichée comme telle. */
  rating: number | null;
  reviewCount: number;
  fromPrice: number | null;
  currency: string;
  durationMinutes: number | null;
  url: string;
}

interface ViatorDestination {
  destinationId: number;
  name: string;
  /** CITY, COUNTRY, REGION… — absent sur certaines entrées. */
  type?: string;
  parentDestinationId?: number;
}

interface ViatorProduct {
  title?: string;
  productUrl?: string;
  images?: { isCover?: boolean; variants?: { url?: string; width?: number }[] }[];
  reviews?: { totalReviews?: number; combinedAverageRating?: number };
  pricing?: { summary?: { fromPrice?: number }; currency?: string };
  duration?: {
    fixedDurationInMinutes?: number;
    variableDurationFromMinutes?: number;
  };
}

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
  /** Même référentiel, en liste : sert aux suggestions de villes. */
  private destinationsList: ViatorDestination[] = [];
  private destinationsFetchedAt = 0;

  private async loadDestinations(): Promise<Map<string, number>> {
    if (this.destinationsById && Date.now() - this.destinationsFetchedAt < DESTINATIONS_TTL_MS) {
      return this.destinationsById;
    }
    const res = await fetch('https://api.viator.com/partner/destinations', {
      headers: { Accept: 'application/json;version=2.0', 'Accept-Language': 'fr-FR', 'exp-api-key': this.apiKey! },
    });
    if (!res.ok) throw new Error(`GET /destinations → ${res.status}`);
    const data = (await res.json()) as { destinations?: ViatorDestination[] };
    this.destinationsList = data.destinations ?? [];
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

  /**
   * Visites et activités les mieux notées d'une ville (Viator Partner API,
   * `POST /products/search`). `null` quand la recherche est impossible — clé
   * absente, ville inconnue de Viator, API en erreur — pour que l'écran
   * propose alors les liens de recherche des partenaires plutôt qu'une liste
   * vide sans explication.
   */
  async searchTours(city: string, trackingId: string, limit = 20): Promise<TourListing[] | null> {
    if (!this.apiKey || !this.partnerId) return null;
    try {
      const destinations = await this.loadDestinations();
      const destinationId = destinations.get(normalizeTitle(city));
      if (!destinationId) return null;

      const res = await fetch('https://api.viator.com/partner/products/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json;version=2.0',
          'Accept-Language': 'fr-FR',
          'exp-api-key': this.apiKey,
        },
        body: JSON.stringify({
          filtering: { destination: String(destinationId) },
          sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
          pagination: { start: 1, count: limit },
          currency: 'EUR',
        }),
      });
      if (!res.ok) {
        this.logger.warn(`searchTours(${city}) : réponse ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { products?: ViatorProduct[] };
      return (data.products ?? []).flatMap((p) => {
        const url = p.productUrl ? this.trackedUrl(p.productUrl, trackingId) : null;
        if (!p.title || !url) return [];
        const cover = p.images?.find((i) => i.isCover) ?? p.images?.[0];
        // La variante la plus proche de 720 px de large : nette sur un
        // téléphone sans télécharger l'original.
        const variant = [...(cover?.variants ?? [])]
          .filter((v) => v.url)
          .sort((a, b) => Math.abs((a.width ?? 0) - 720) - Math.abs((b.width ?? 0) - 720))[0];
        const reviewCount = p.reviews?.totalReviews ?? 0;
        return [{
          provider: 'viator' as const,
          title: p.title,
          imageUrl: variant?.url ?? null,
          rating: reviewCount > 0 ? p.reviews?.combinedAverageRating ?? null : null,
          reviewCount,
          fromPrice: p.pricing?.summary?.fromPrice ?? null,
          currency: p.pricing?.currency ?? 'EUR',
          durationMinutes:
            p.duration?.fixedDurationInMinutes ?? p.duration?.variableDurationFromMinutes ?? null,
          url,
        }];
      });
    } catch (e) {
      this.logger.warn(`searchTours(${city}) indisponible : ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Villes dont le nom commence par (puis contient) `q`, pour l'autocomplétion
   * de l'écran Visites guidées. Tirées du référentiel Viator déjà en cache :
   * aucun appel facturé, et chaque ville proposée a forcément des visites.
   * Le libellé porte le pays, pour distinguer Valence (Espagne) de Valence
   * (France).
   */
  async suggestCities(q: string, limit = 8): Promise<{ name: string; label: string }[]> {
    const needle = normalizeTitle(q);
    if (!this.apiKey || needle.length < 2) return [];
    try {
      await this.loadDestinations();
    } catch (e) {
      this.logger.warn(`suggestCities indisponible : ${(e as Error).message}`);
      return [];
    }
    const byId = new Map(this.destinationsList.map((d) => [d.destinationId, d]));
    const countryOf = (d: ViatorDestination): string | null => {
      let cur: ViatorDestination | undefined = d;
      for (let i = 0; cur && i < 6; i++) {
        if (cur.type === 'COUNTRY') return cur.name;
        cur = cur.parentDestinationId != null ? byId.get(cur.parentDestinationId) : undefined;
      }
      return null;
    };
    const cities = this.destinationsList.filter((d) => !d.type || d.type === 'CITY');
    const scored = cities.flatMap((d) => {
      const n = normalizeTitle(d.name);
      const rank = n.startsWith(needle) ? 0 : n.includes(` ${needle}`) ? 1 : -1;
      return rank < 0 ? [] : [{ d, rank, len: n.length }];
    });
    scored.sort((a, b) => a.rank - b.rank || a.len - b.len || a.d.name.localeCompare(b.d.name));
    const seen = new Set<string>();
    const out: { name: string; label: string }[] = [];
    for (const { d } of scored) {
      const country = countryOf(d);
      const label = country ? `${d.name}, ${country}` : d.name;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ name: d.name, label });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Ajoute notre identifiant partenaire à un lien produit, s'il n'y est pas déjà. */
  private trackedUrl(productUrl: string, trackingId: string): string | null {
    try {
      const u = new URL(productUrl);
      if (!u.searchParams.has('pid')) u.searchParams.set('pid', this.partnerId!);
      if (!u.searchParams.has('mcid')) u.searchParams.set('mcid', '42383');
      u.searchParams.set('medium', 'api');
      u.searchParams.set('campaign', trackingId);
      return u.toString();
    } catch {
      return null;
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
