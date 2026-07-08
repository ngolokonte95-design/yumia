import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PipelineService } from './pipeline.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AddMenuItemsDto {
  language?: string;
  items: Array<{
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    category?: string;
    photoUrl?: string;
    tags?: string[];
    available?: boolean;
  }>;
}

export interface ExtractMenuPhotoDto {
  /** URL publique de la photo du menu (ou data URI base64). */
  photoUrl: string;
  language?: string;
}

export interface FetchEventsDto {
  lat: number;
  lng: number;
  radiusKm?: number;
  keyword?: string;
  startDate?: string;
  /** 'ticketmaster' | 'eventbrite' | 'all' */
  source?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('pipeline')
@UseGuards(JwtAuthGuard)
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  // ── MENU ──────────────────────────────────────────────────────────────────

  /** Récupère la carte d'un lieu. */
  @Get('menu/:placeId')
  getMenu(
    @Param('placeId') placeId: string,
    @Query('language') language?: string,
  ) {
    return this.pipeline.getMenu(placeId, language);
  }

  /** Ajoute des items manuellement à la carte d'un lieu. */
  @Post('menu/:placeId')
  addMenuItems(
    @Param('placeId') placeId: string,
    @Body() dto: AddMenuItemsDto,
  ) {
    return this.pipeline.addMenuItems(placeId, dto);
  }

  /**
   * Lance une extraction IA depuis une photo de menu.
   * Renvoie immédiatement un jobId ; le résultat est disponible via GET /pipeline/jobs/:jobId.
   */
  @Post('menu/:placeId/extract-photo')
  extractMenuPhoto(
    @Param('placeId') placeId: string,
    @Body() dto: ExtractMenuPhotoDto,
  ) {
    return this.pipeline.extractMenuFromPhoto(placeId, dto);
  }

  // ── ÉVÉNEMENTS ────────────────────────────────────────────────────────────

  /** Récupère les événements à venir pour un lieu. */
  @Get('events/:placeId')
  getEvents(
    @Param('placeId') placeId: string,
    @Query('from') from?: string,
  ) {
    return this.pipeline.getEvents(placeId, from ? new Date(from) : undefined);
  }

  /**
   * Lance un fetch d'événements (Ticketmaster/Eventbrite) pour un lieu.
   * Renvoie immédiatement un jobId.
   */
  @Post('events/:placeId/fetch')
  fetchEvents(
    @Param('placeId') placeId: string,
    @Body() dto: FetchEventsDto,
  ) {
    return this.pipeline.fetchEvents(placeId, dto);
  }

  // ── JOBS ──────────────────────────────────────────────────────────────────

  /** Liste les jobs d'enrichissement (admin / debug). */
  @Get('jobs')
  listJobs(
    @Query('placeId') placeId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.pipeline.listJobs(placeId, status, limit ? parseInt(limit, 10) : 50);
  }
}
