/**
 * Routes de la boutique.
 *
 * Découpage : catalogue public (authentifié mais sans restriction), panier /
 * commandes propres à l'utilisateur, webhook Stripe public (protégé par la
 * signature, pas par le JWT — Stripe ne peut pas en présenter un), et
 * administration de l'import réservée aux admins.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { AliExpressService } from './aliexpress.service';
import { CartService } from './cart.service';
import { CatalogService, type ProductSort } from './catalog.service';
import { OrdersService } from './orders.service';
import { ShopImportService } from './shop-import.service';

/** `?featured=true` arrive en chaîne — on ne veut pas que "false" soit vrai. */
const asBool = (v?: string): boolean | undefined => (v == null ? undefined : v === 'true');
const asInt = (v?: string): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

@Controller('shop')
export class ShopController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly cart: CartService,
    private readonly orders: OrdersService,
    private readonly imports: ShopImportService,
    private readonly aliexpress: AliExpressService,
  ) {}

  // ── Catalogue ─────────────────────────────────────────────────────────────

  @Get('categories')
  @UseGuards(JwtAuthGuard)
  categories() {
    return this.catalog.listCategories();
  }

  @Get('products')
  @UseGuards(JwtAuthGuard)
  products(
    @Query('category') categorySlug?: string,
    @Query('q') q?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minRating') minRating?: string,
    @Query('maxDeliveryDays') maxDeliveryDays?: string,
    @Query('featured') featured?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalog.listProducts({
      categorySlug,
      q,
      minPriceCents: asInt(minPrice),
      maxPriceCents: asInt(maxPrice),
      minRating: asInt(minRating),
      maxDeliveryDays: asInt(maxDeliveryDays),
      featuredOnly: asBool(featured),
      sort: sort as ProductSort | undefined,
      page: asInt(page),
      pageSize: asInt(pageSize),
    });
  }

  /** Rayon lié à un univers YUMIA — produits proposés en contexte sur une fiche lieu. */
  @Get('categories/by-universe/:universe')
  @UseGuards(JwtAuthGuard)
  categoryByUniverse(@Param('universe') universe: string) {
    return this.catalog.categoryForUniverse(universe);
  }

  @Get('products/:slug')
  @UseGuards(JwtAuthGuard)
  product(@CurrentUser() user: JwtPayload, @Param('slug') slug: string) {
    return this.catalog.getProduct(slug, user.sub);
  }

  // ── Wishlist & avis ───────────────────────────────────────────────────────

  @Get('wishlist')
  @UseGuards(JwtAuthGuard)
  wishlist(@CurrentUser() user: JwtPayload) {
    return this.catalog.listWishlist(user.sub);
  }

  @Post('wishlist/:productId')
  @UseGuards(JwtAuthGuard)
  toggleWishlist(@CurrentUser() user: JwtPayload, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.catalog.toggleWishlist(user.sub, productId);
  }

  @Post('products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  review(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: { rating: number; comment?: string },
  ) {
    if (typeof body?.rating !== 'number') throw new BadRequestException('Note manquante');
    return this.catalog.upsertReview(user.sub, productId, body.rating, body.comment);
  }

  // ── Panier ────────────────────────────────────────────────────────────────

  @Get('cart')
  @UseGuards(JwtAuthGuard)
  getCart(@CurrentUser() user: JwtPayload) {
    return this.cart.getCart(user.sub);
  }

  @Post('cart/items')
  @UseGuards(JwtAuthGuard)
  addToCart(
    @CurrentUser() user: JwtPayload,
    @Body() body: { productId: string; variantId?: string; quantity?: number },
  ) {
    if (!body?.productId) throw new BadRequestException('productId manquant');
    return this.cart.addItem(user.sub, body.productId, body.variantId, body.quantity);
  }

  @Patch('cart/items/:itemId')
  @UseGuards(JwtAuthGuard)
  updateCartItem(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { quantity: number },
  ) {
    if (typeof body?.quantity !== 'number') throw new BadRequestException('quantity manquante');
    return this.cart.updateQuantity(user.sub, itemId, body.quantity);
  }

  @Delete('cart/items/:itemId')
  @UseGuards(JwtAuthGuard)
  removeCartItem(@CurrentUser() user: JwtPayload, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.cart.removeItem(user.sub, itemId);
  }

  // ── Adresses ──────────────────────────────────────────────────────────────

  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  addresses(@CurrentUser() user: JwtPayload) {
    return this.orders.listAddresses(user.sub);
  }

  @Post('addresses')
  @UseGuards(JwtAuthGuard)
  createAddress(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      fullName: string; line1: string; line2?: string; city: string;
      postalCode: string; countryCode?: string; phone: string; isDefault?: boolean;
    },
  ) {
    const required = ['fullName', 'line1', 'city', 'postalCode', 'phone'] as const;
    const missing = required.filter((f) => !body?.[f]?.trim());
    if (missing.length) throw new BadRequestException(`Champs manquants : ${missing.join(', ')}`);
    return this.orders.createAddress(user.sub, body);
  }

  @Delete('addresses/:id')
  @UseGuards(JwtAuthGuard)
  deleteAddress(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.deleteAddress(user.sub, id);
  }

  // ── Commandes ─────────────────────────────────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser() user: JwtPayload, @Body() body: { addressId: string }) {
    if (!body?.addressId) throw new BadRequestException('addressId manquant');
    return this.orders.checkout(user.sub, body.addressId);
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  listOrders(@CurrentUser() user: JwtPayload) {
    return this.orders.listOrders(user.sub);
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  getOrder(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOrder(user.sub, id);
  }

  /**
   * Webhook de paiement Stripe. Volontairement SANS JwtAuthGuard : Stripe ne
   * peut pas présenter de jeton utilisateur. L'authenticité est garantie par
   * la signature du corps brut (voir OrdersService.handleStripeWebhook).
   */
  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new BadRequestException('Signature Stripe absente');
    if (!req.rawBody) throw new BadRequestException('Corps brut indisponible');
    await this.orders.handleStripeWebhook(req.rawBody, signature);
    return { received: true };
  }

  // ── Administration ────────────────────────────────────────────────────────

  @Get('admin/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminStatus() {
    const token = await this.aliexpress.getTokenStatus();
    return {
      aliexpressConfigured: this.aliexpress.isConfigured(),
      aliexpressLinked: token.linked,
      // Jeton partagé avec SPORTIA (une seule app Drop Shipping par compte) :
      // à surveiller, cf. AliExpressService.getTokenStatus.
      aliexpressToken: token,
      stripeConfigured: this.orders.isConfigured(),
    };
  }

  /** URL de consentement OAuth AliExpress, à ouvrir une fois dans un navigateur. */
  @Get('admin/aliexpress/authorize-url')
  @UseGuards(JwtAuthGuard, AdminGuard)
  authorizeUrl() {
    return { url: this.aliexpress.getAuthorizeUrl() };
  }

  /**
   * Callback OAuth AliExpress. Public par nature (c'est AliExpress qui
   * redirige le navigateur ici, sans jeton YUMIA) — le `code` reçu n'est
   * exploitable qu'avec notre APP_SECRET.
   */
  @Get('aliexpress/callback')
  async aliexpressCallback(@Query('code') code?: string) {
    if (!code) return { ok: false, message: 'Code absent' };
    const ok = await this.aliexpress.exchangeCodeForToken(code);
    return { ok, message: ok ? 'YUMIA est connecté à AliExpress.' : 'Échec de la connexion.' };
  }

  @Post('admin/categories/seed')
  @UseGuards(JwtAuthGuard, AdminGuard)
  seedCategories() {
    return this.imports.seedCategories();
  }

  @Get('admin/aliexpress/search')
  @UseGuards(JwtAuthGuard, AdminGuard)
  searchAliexpress(@Query('keyword') keyword: string, @Query('limit') limit?: string) {
    if (!keyword) throw new BadRequestException('keyword manquant');
    return this.aliexpress.search(keyword, 1, asInt(limit) ?? 20);
  }

  @Post('admin/import/:categorySlug')
  @UseGuards(JwtAuthGuard, AdminGuard)
  importCategory(@Param('categorySlug') slug: string, @Body() body?: { limitPerTerm?: number }) {
    return this.imports.importCategory(slug, body?.limitPerTerm ?? 10);
  }
}
