import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, NotFoundException, Param, ParseFloatPipe, ParseUUIDPipe, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { AffiliatesService, isThemeFacet, isTourTheme, type TourTheme } from './affiliates.service';
import { isQuickFilter, type QuickFilter } from './tour-relevance';
import type { AffiliateProviderKey } from './providers/affiliate-provider.interface';

/** Rayon maximal de Bons Plans, en mètres. */
const DEALS_MAX_RADIUS_M = 50_000;

/**
 * Compare le secret reçu à AFFILIATE_WEBHOOK_SECRET en temps constant.
 * Env absente : tout est refusé en production ; accepté hors production pour
 * ne pas bloquer le développement local.
 */
export function webhookSecretMatches(received: string | undefined): boolean {
  const expected = process.env.AFFILIATE_WEBHOOK_SECRET ?? '';
  if (!expected) return process.env.NODE_ENV !== 'production';
  if (!received) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller()
export class AffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  /** GET /api/affiliates/deals?lat=&lng=&radius= — alimente l'onglet "Bons plans". */
  @Get('affiliates/deals')
  @UseGuards(JwtAuthGuard)
  deals(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
  ) {
    // Rayon en mètres, plafonné à 50 km : chaque univers interroge le
    // fournisseur de lieux, un rayon démesuré ne sert qu'à coûter plus cher.
    const r = radius ? Number(radius) : 10_000;
    const safeRadius = Number.isFinite(r) && r > 0 ? Math.min(r, DEALS_MAX_RADIUS_M) : 10_000;
    return this.affiliates.getNearbyDeals({ lat, lng, radius: safeRadius });
  }

  /** GET /api/places/:id/affiliate-providers — providers pertinents pour ce lieu, vérifiés (fiche réelle chez le partenaire). */
  @Get('places/:id/affiliate-providers')
  @UseGuards(JwtAuthGuard)
  async listProviders(@Param('id', ParseUUIDPipe) id: string) {
    return this.affiliates.availableProvidersForPlace(id);
  }

  /** GET /api/places/:id/booking-link?provider=booking — génère (et trace) un lien de réservation. */
  @Get('places/:id/booking-link')
  @UseGuards(JwtAuthGuard)
  async bookingLink(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('provider') provider: string,
  ) {
    const link = await this.affiliates.createBookingLink(provider as AffiliateProviderKey, id, user.sub);
    if (!link) throw new NotFoundException('Aucun lien disponible pour ce partenaire/lieu.');
    return { url: link };
  }

  /** GET /api/affiliates/car-rental?city=Paris&locale=fr — écran Location de voiture. */
  @Get('affiliates/car-rental')
  @UseGuards(JwtAuthGuard)
  async carRental(@CurrentUser() user: JwtPayload, @Query('city') city?: string, @Query('locale') locale?: string) {
    const c = (city ?? '').trim();
    if (!c) throw new BadRequestException('Ville manquante.');
    const link = await this.affiliates.carRentalLink(c.slice(0, 80), locale, user.sub);
    if (!link) throw new NotFoundException('Location de voiture indisponible.');
    return link;
  }

  /** GET /api/affiliates/tours/cities?q=bar — villes proposées pendant la saisie. */
  @Get('affiliates/tours/cities')
  @UseGuards(JwtAuthGuard)
  async tourCities(@Query('q') q?: string) {
    return { cities: await this.affiliates.suggestTourCities((q ?? '').slice(0, 60)) };
  }

  /**
   * GET /api/affiliates/tours?city=Paris[&theme=skip_the_line] — écran des
   * visites : Visites guidées par défaut, ou l'un des thèmes des onglets
   * « Réserve chez nos partenaires » (voir TOUR_THEMES).
   */
  @Get('affiliates/tours')
  @UseGuards(JwtAuthGuard)
  tours(
    @CurrentUser() user: JwtPayload,
    @Query('city') city?: string,
    @Query('theme') theme?: string,
    @Query('facet') facet?: string,
    @Query('quick') quick?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('alt') alt?: string,
  ) {
    const c = (city ?? '').trim();
    if (!c) throw new BadRequestException('Ville manquante.');
    if (theme && !isTourTheme(theme)) throw new BadRequestException('Thème inconnu.');
    const t = (theme as TourTheme | undefined) ?? 'guides';
    if (facet && !isThemeFacet(t, facet)) throw new BadRequestException('Filtre inconnu.');
    const quickList = (quick ?? '').split(',').map((q) => q.trim()).filter(Boolean);
    if (!quickList.every(isQuickFilter)) throw new BadRequestException('Filtre pratique inconnu.');
    const p = Math.min(10, Math.max(1, parseInt(page ?? '1', 10) || 1));
    return this.affiliates.guidedTours(
      c.slice(0, 80), user.sub, t, facet, quickList as QuickFilter[],
      q?.trim().slice(0, 60) || undefined, p, alt === '1',
    );
  }

  /** GET /api/affiliates/generic-categories — catégories disponibles pour les onglets Explorer (activités, transfert aéroport...). */
  @Get('affiliates/generic-categories')
  @UseGuards(JwtAuthGuard)
  genericCategories() {
    return { categories: this.affiliates.genericCategories() };
  }

  /** GET /api/affiliates/generic-link?category=airport_transfer — lien tracké générique (pas de lieu précis). */
  @Get('affiliates/generic-link')
  @UseGuards(JwtAuthGuard)
  async genericLink(@CurrentUser() user: JwtPayload, @Query('category') category: string) {
    const link = await this.affiliates.createGenericLink(category, user.sub);
    if (!link) throw new NotFoundException('Aucun lien disponible pour cette catégorie.');
    return { url: link };
  }

  /** POST /api/affiliates/webhook/:provider — conversion rapportée par un partenaire (public, pas d'auth utilisateur). */
  @Post('affiliates/webhook/:provider')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('provider') provider: string,
    @Headers('x-yumia-webhook-secret') secret: string | undefined,
    @Body() payload: unknown,
  ) {
    // Route publique : sans secret partagé, n'importe qui pouvait écrire des
    // conversions (et des Mo de `raw`) en base.
    if (!webhookSecretMatches(secret)) throw new UnauthorizedException('Secret de webhook invalide.');
    if (!this.affiliates.isKnownProvider(provider)) throw new NotFoundException('Partenaire inconnu.');
    await this.affiliates.recordConversion(provider, payload);
    return { received: true };
  }
}
