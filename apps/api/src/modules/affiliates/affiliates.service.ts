import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import type { AffiliateProvider, AffiliateProviderKey } from './providers/affiliate-provider.interface';
import { BookingProvider } from './providers/booking.provider';
import { GetYourGuideProvider } from './providers/getyourguide.provider';
import { ViatorProvider } from './providers/viator.provider';
import { providersForUniverse, UNIVERSE_AFFILIATE_PROVIDERS } from './universe-provider-map';

/**
 * Onglets génériques d'Explorer ("Réserver une activité", "Transfert
 * aéroport"...) — pas de lieu ciblé, juste un lien tracké vers le partenaire
 * (page d'accueil, ou recherche pré-remplie par thème).
 *
 * `requiresEnvFlag` : interrupteur additionnel, indépendant de
 * `provider.isConfigured()` (qui ne vérifie que la présence de la clé/AID).
 * Utile pour Booking.com : l'AID est déjà configuré dans `.env.prod` mais
 * l'inscription est encore "en attente" côté CJ Affiliate — tant que ce flag
 * n'est pas à 'true', ces catégories restent invisibles (createGenericLink
 * renvoie null, comme si le provider n'était pas configuré), même si l'AID
 * est déjà présent. Pas d'impact sur Bons Plans/booking-link (place.tsx),
 * qui continuent de suivre uniquement isConfigured() comme avant.
 */
const GENERIC_CATEGORIES: Record<string, { provider: AffiliateProviderKey; searchTerm?: string; requiresEnvFlag?: string }> = {
  activities: { provider: 'getyourguide' },
  skip_the_line: { provider: 'viator', searchTerm: 'skip the line' },
  food_tours: { provider: 'getyourguide', searchTerm: 'food tour' },
  hop_on_hop_off: { provider: 'viator', searchTerm: 'hop-on hop-off' },
  airport_transfer: { provider: 'viator', searchTerm: 'airport transfer' },
  adventure: { provider: 'getyourguide', searchTerm: 'outdoor adventure' },
  shows: { provider: 'getyourguide', searchTerm: 'show' },
  // Prêts côté code, masqués tant que Booking.com n'est pas approuvé par CJ —
  // activer en mettant BOOKING_GENERIC_TABS_ENABLED=true dans .env.prod le
  // jour de l'approbation (aucun redéploiement de code nécessaire).
  hotel: { provider: 'booking', requiresEnvFlag: 'BOOKING_GENERIC_TABS_ENABLED' },
  car_rental: { provider: 'booking', searchTerm: 'cars', requiresEnvFlag: 'BOOKING_GENERIC_TABS_ENABLED' },
  flights: { provider: 'booking', searchTerm: 'flights', requiresEnvFlag: 'BOOKING_GENERIC_TABS_ENABLED' },
};
export type GenericDealCategory = keyof typeof GENERIC_CATEGORIES;

function categoryEnabled(spec: { requiresEnvFlag?: string }): boolean {
  return !spec.requiresEnvFlag || process.env[spec.requiresEnvFlag] === 'true';
}

@Injectable()
export class AffiliatesService {
  private readonly providers: Map<AffiliateProviderKey, AffiliateProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
    booking: BookingProvider,
    getyourguide: GetYourGuideProvider,
    viator: ViatorProvider,
  ) {
    // Chaque nouveau partenaire (Fever, Treatwell, Trainline...) s'ajoute
    // simplement ici une fois son provider implémenté — le mapping univers →
    // provider et le reste du flux (clic, stats) ne changent pas.
    this.providers = new Map<AffiliateProviderKey, AffiliateProvider>([
      [booking.key, booking],
      [getyourguide.key, getyourguide],
      [viator.key, viator],
    ]);
  }

  async universeOf(placeId: string): Promise<string | null> {
    const place = await this.prisma.place.findUnique({ where: { id: placeId }, select: { universe: true } });
    return place?.universe ?? null;
  }

  /** Providers pertinents pour un univers, avec leur disponibilité réelle (clé configurée ou non). */
  availableProviders(universe: string | null | undefined) {
    return providersForUniverse(universe).map((key) => ({
      key,
      configured: this.providers.get(key)?.isConfigured() ?? false,
    }));
  }

  /**
   * Comme `availableProviders`, mais ne garde que les providers dont
   * `verifyListing` confirme (quand implémenté) qu'une fiche existe vraiment
   * pour CE lieu — évite d'afficher un bouton "Réserver" qui retombe sur une
   * recherche sans rapport. Un provider sans `verifyListing` (pas encore
   * d'accès à l'API de recherche du partenaire) reste inclus tel quel.
   */
  private async verifiedProviders(
    place: { name: string; city: string; universe: string },
  ): Promise<AffiliateProviderKey[]> {
    const candidates = this.availableProviders(place.universe).filter((p) => p.configured);
    const checks = await Promise.all(candidates.map(async (p) => {
      const provider = this.providers.get(p.key);
      const ok = await provider?.verifyListing?.(place) ?? true;
      return ok ? p.key : null;
    }));
    return checks.filter((k): k is AffiliateProviderKey => k !== null);
  }

  /** Pour la fiche d'un lieu — GET /places/:id/affiliate-providers. */
  async availableProvidersForPlace(placeId: string) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { name: true, city: true, universe: true },
    });
    if (!place) return { providers: [] };
    const verifiedKeys = new Set(await this.verifiedProviders(place));
    return {
      providers: this.availableProviders(place.universe)
        .map((p) => ({ ...p, configured: p.configured && verifiedKeys.has(p.key) })),
    };
  }

  /** Génère un lien tracké, enregistre le clic, renvoie l'URL — ou null si le provider n'est pas encore prêt. */
  async createBookingLink(
    providerKey: AffiliateProviderKey,
    placeId: string,
    userId: string | undefined,
  ): Promise<string | null> {
    const provider = this.providers.get(providerKey);
    if (!provider) return null;

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true, city: true, lat: true, lng: true, universe: true },
    });
    if (!place) throw new NotFoundException('Lieu introuvable');

    const trackingId = randomUUID();
    const link = provider.generateBookingLink(place, trackingId);
    if (!link) return null;

    await this.prisma.affiliateClick.create({
      data: {
        id: trackingId,
        userId,
        placeId: place.id,
        universe: place.universe,
        provider: providerKey,
      },
    });

    return link;
  }

  /** La liste des catégories génériques disponibles, avec leur disponibilité réelle (provider configuré + flag d'activation le cas échéant). */
  genericCategories() {
    return Object.entries(GENERIC_CATEGORIES).map(([category, spec]) => ({
      category,
      provider: spec.provider,
      configured: (this.providers.get(spec.provider)?.isConfigured() ?? false) && categoryEnabled(spec),
    }));
  }

  /**
   * Lien tracké générique pour un onglet Explorer ("activities",
   * "airport_transfer"...) — voir GENERIC_CATEGORIES. Même mécanique de
   * tracking que createBookingLink, mais sans lieu (placeId/universe null).
   */
  async createGenericLink(category: string, userId: string | undefined): Promise<string | null> {
    const spec = GENERIC_CATEGORIES[category];
    if (!spec || !categoryEnabled(spec)) return null;
    const provider = this.providers.get(spec.provider);
    if (!provider) return null;

    const trackingId = randomUUID();
    const link = provider.generateGenericLink(trackingId, spec.searchTerm);
    if (!link) return null;

    await this.prisma.affiliateClick.create({
      data: { id: trackingId, userId, provider: spec.provider },
    });

    return link;
  }

  /** Webhook générique de conversion — accepte le payload brut, tente d'en extraire un montant. */
  async recordConversion(providerKey: string, payload: unknown) {
    const provider = this.providers.get(providerKey as AffiliateProviderKey);
    const parsed = provider?.parseConversion?.(payload) ?? null;

    let clickId: string | undefined;
    if (parsed?.clickTrackingId) {
      const click = await this.prisma.affiliateClick.findUnique({ where: { id: parsed.clickTrackingId } });
      if (click) clickId = click.id;
    }

    await this.prisma.affiliateConversion.create({
      data: {
        provider: providerKey,
        clickId,
        amountCents: parsed?.amountCents,
        currency: parsed?.currency,
        raw: payload as never,
      },
    });
  }

  /**
   * Alimente l'onglet "Bons plans" — lieux proches dont l'univers a au moins
   * un partenaire d'affiliation *configuré*. Interroge chaque univers
   * éligible séparément (et non un `nearby` global) pour garantir une
   * représentation de chaque catégorie (hôtels, activités, bien-être...)
   * plutôt que d'être noyé par l'univers le plus dense localement.
   */
  async getNearbyDeals(params: { lat: number; lng: number; radius: number }) {
    const configuredUniverses = Object.entries(UNIVERSE_AFFILIATE_PROVIDERS)
      .filter(([, keys]) => keys.some((k) => this.providers.get(k)?.isConfigured()))
      .map(([universe]) => universe as Universe);

    const perUniverse = await Promise.all(
      configuredUniverses.map(async (universe) => {
        const places = await this.places.nearby({ ...params, universe, limit: 6 }).catch(() => []);
        const withProviders = await Promise.all(places.map(async (p) => ({
          ...p,
          affiliateProviders: await this.verifiedProviders({ name: p.name, city: p.city, universe }),
        })));
        // Un lieu dont AUCUN provider ne survit à la vérification n'a plus sa
        // place dans "Bons plans" — c'était exactement le cas signalé
        // (lieux affichés sans fiche réelle chez le partenaire).
        return withProviders.filter((p) => p.affiliateProviders.length > 0);
      }),
    );

    return perUniverse
      .flat()
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 40);
  }

  // ── Dashboard admin ─────────────────────────────────────────────────────

  async getStats() {
    const [clicksByProvider, conversionsByProvider, clicksByUniverse, totalClicks, totalConversions, revenue] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ provider: string; count: bigint }>>`
          SELECT "provider", COUNT(*)::bigint as count FROM "AffiliateClick" GROUP BY "provider" ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ provider: string; count: bigint }>>`
          SELECT "provider", COUNT(*)::bigint as count FROM "AffiliateConversion" GROUP BY "provider" ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ universe: string | null; count: bigint }>>`
          SELECT "universe"::text as universe, COUNT(*)::bigint as count FROM "AffiliateClick"
          WHERE "universe" IS NOT NULL GROUP BY "universe" ORDER BY count DESC
        `,
        this.prisma.affiliateClick.count(),
        this.prisma.affiliateConversion.count(),
        this.prisma.affiliateConversion.aggregate({ _sum: { amountCents: true } }),
      ]);

    return {
      totalClicks,
      totalConversions,
      conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 1000) / 10 : 0,
      revenueCents: revenue._sum.amountCents ?? 0,
      clicksByProvider: clicksByProvider.map((r) => ({ provider: r.provider, count: Number(r.count) })),
      conversionsByProvider: conversionsByProvider.map((r) => ({ provider: r.provider, count: Number(r.count) })),
      clicksByUniverse: clicksByUniverse.map((r) => ({ universe: r.universe ?? '?', count: Number(r.count) })),
    };
  }

  async getClicksTrend(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
      FROM "AffiliateClick"
      WHERE "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
