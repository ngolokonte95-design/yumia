import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseFloatPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { AffiliatesService } from './affiliates.service';
import type { AffiliateProviderKey } from './providers/affiliate-provider.interface';

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
    return this.affiliates.getNearbyDeals({ lat, lng, radius: radius ? +radius : 10_000 });
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
  async webhook(@Param('provider') provider: string, @Body() payload: unknown) {
    await this.affiliates.recordConversion(provider, payload);
    return { received: true };
  }
}
