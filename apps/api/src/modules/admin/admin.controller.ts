import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';
import { ModerationService, type ModerationAction } from './moderation.service';
import { AffiliatesService } from '../affiliates/affiliates.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly moderation: ModerationService,
    private readonly affiliatesService: AffiliatesService,
  ) {}

  /** Vérifie si l'utilisateur courant est admin (pas besoin d'AdminGuard ici). */
  @Get('is-admin')
  isAdmin(@Req() req: any) {
    return { isAdmin: this.adminService.isAdmin(req.user.email) };
  }

  /**
   * POST /admin/me/plan — bascule le forfait DU COMPTE ADMIN.
   *
   * Sert à vérifier ce que voit un compte Gratuit sans créer un second
   * compte : les quotas de l'app suivent le forfait, y compris pour l'admin.
   */
  @Post('me/plan')
  @UseGuards(AdminGuard)
  async setOwnPlan(@Req() req: any, @Body('plan') plan: string) {
    try {
      return await this.adminService.setOwnPlan(req.user.sub, plan);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  overview() {
    return this.adminService.getOverview();
  }

  @Get('users/by-country')
  @UseGuards(AdminGuard)
  usersByCountry() {
    return this.adminService.getUsersByCountry();
  }

  @Get('users/growth')
  @UseGuards(AdminGuard)
  userGrowth(@Query('days') days?: string) {
    return this.adminService.getUserGrowth(days ? +days : 30);
  }

  @Get('places/by-universe')
  @UseGuards(AdminGuard)
  placesByUniverse() {
    return this.adminService.getPlacesByUniverse();
  }

  @Get('users/recent')
  @UseGuards(AdminGuard)
  recentUsers(@Query('limit') limit?: string) {
    return this.adminService.getRecentUsers(limit ? +limit : 20);
  }

  @Post('backfill/countries')
  @UseGuards(AdminGuard)
  backfillCountries() {
    return this.adminService.backfillCountriesFromLocale();
  }

  @Get('affiliates/stats')
  @UseGuards(AdminGuard)
  affiliateStats() {
    return this.affiliatesService.getStats();
  }

  @Get('affiliates/trend')
  @UseGuards(AdminGuard)
  affiliateTrend(@Query('days') days?: string) {
    return this.affiliatesService.getClicksTrend(days ? +days : 30);
  }

  // ── Modération ────────────────────────────────────────────────────────────
  //
  // La règle 1.2 de l'App Store demande, pour toute app à contenu utilisateur,
  // de pouvoir retirer un contenu signalé ET d'exclure son auteur. Les
  // signalements étaient enregistrés depuis le début, mais rien ne permettait
  // de les lire : ils partaient dans le vide.

  /** File d'attente des signalements, du plus ancien au plus récent. */
  @Get('reports')
  @UseGuards(AdminGuard)
  reports(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.moderation.listReports(status ?? 'pending', limit ? +limit : 50);
  }

  /** Pastille du tableau de bord : combien de signalements attendent. */
  @Get('reports/pending-count')
  @UseGuards(AdminGuard)
  async pendingReports() {
    return { count: await this.moderation.pendingCount() };
  }

  /**
   * Traite un signalement : classer sans suite, retirer le contenu, suspendre
   * l'auteur, ou les deux. `days` absent sur une suspension = définitive.
   */
  @Post('reports/:id/resolve')
  @UseGuards(AdminGuard)
  resolveReport(
    @Param('id') id: string,
    @Body() dto: { action: ModerationAction; days?: number; reason?: string },
  ) {
    return this.moderation.resolve(id, dto.action, { days: dto.days, reason: dto.reason });
  }

  /**
   * GET /admin/users — centre de contrôle : recherche (email, nom), segment
   * (celui d'une carte de la vue d'ensemble, ou suspended / banned), pays.
   */
  @Get('users')
  @UseGuards(AdminGuard)
  listUsers(
    @Query('segment') segment?: string,
    @Query('q') q?: string,
    @Query('country') country?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listUsers({
      segment,
      q,
      country,
      offset: offset ? parseInt(offset, 10) || 0 : 0,
      limit: limit ? parseInt(limit, 10) || 30 : 30,
    });
  }

  /** Comptes suspendus, pour pouvoir revenir sur une décision. */
  @Get('users/suspended')
  @UseGuards(AdminGuard)
  suspendedUsers() {
    return this.moderation.listSuspended();
  }

  /** Suspension directe, sans passer par un signalement. */
  @Post('users/:id/suspend')
  @UseGuards(AdminGuard)
  async suspendUser(
    @Param('id') id: string,
    @Body() dto: { days?: number; reason?: string },
  ) {
    return { suspendedUntil: await this.moderation.suspend(id, dto.days, dto.reason) };
  }

  /** Fiche complète d'un compte. Déclarée après les routes fixes users/…. */
  @Get('users/:id')
  @UseGuards(AdminGuard)
  userDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Post('users/:id/unsuspend')
  @UseGuards(AdminGuard)
  async unsuspendUser(@Param('id') id: string) {
    await this.moderation.unsuspend(id);
    return { ok: true };
  }
}
