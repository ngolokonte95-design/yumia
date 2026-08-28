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
        return places.map((p) => ({
          ...p,
          affiliateProviders: this.availableProviders(universe).filter((pr) => pr.configured).map((pr) => pr.key),
        }));
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
