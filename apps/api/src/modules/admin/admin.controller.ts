import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Vérifie si l'utilisateur courant est admin (pas besoin d'AdminGuard ici). */
  @Get('is-admin')
  isAdmin(@Req() req: any) {
    return { isAdmin: this.adminService.isAdmin(req.user.email) };
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
}
