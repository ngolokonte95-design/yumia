import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';
import { AffiliatesService } from '../affiliates/affiliates.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
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
}
