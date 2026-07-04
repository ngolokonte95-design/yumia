import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFloatPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { Place } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../../infra/storage/storage.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { ListPlacesDto } from './dto/list-places.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { PlacesService, type PlaceWithDistance } from './places.service';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Lieux (POI) : liste, recherche géo, détail, création. */
@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly storage: StorageService,
  ) {}

  /** GET /api/places — liste paginée filtrable (ville, univers). 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  list(@Query() query: ListPlacesDto): Promise<Place[]> {
    return this.places.list({
      city: query.city,
      universe: query.universe,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  /** GET /api/places/nearby — lieux proches d'un point, triés par distance. 60/60s. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('nearby')
  async nearby(@Query() query: NearbyQueryDto) {
    const places = await this.places.nearby({
      lat: query.lat,
      lng: query.lng,
      radius: query.radius ?? 2_000,
      universe: query.universe,
      limit: query.limit ?? 20,
    });
    return places.map((p) => {
      // $queryRaw retourne les colonnes JSON comme des chaînes — on parse si besoin.
      const raw = p.metadata;
      const meta = (typeof raw === 'string'
        ? (JSON.parse(raw) as { openingHours?: string[] })
        : (raw as { openingHours?: string[] } | null));
      return { ...p, openingHours: meta?.openingHours ?? [] };
    });
  }

  /** GET /api/places/city?name=...&universe=... — recherche par ville, sans géoloc. 30/60s. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('city')
  searchByCity(
    @Query('name') name: string,
    @Query('universe') universe?: string,
    @Query('limit') limit?: string,
  ): Promise<Place[]> {
    if (!name || name.trim().length < 2) {
      throw new BadRequestException('Paramètre « name » requis (ville).');
    }
    return this.places.searchByCity({
      city: name.trim(),
      universe: universe as Parameters<typeof this.places.searchByCity>[0]['universe'],
      limit: limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20,
    });
  }

  /** GET /api/places/trending — lieux tendance près de vous (dernières 24h). 30/60s. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('trending')
  trending(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
    @Query('hours') hours?: string,
  ) {
    return this.places.trending({
      lat,
      lng,
      radius: radius ? parseFloat(radius) : 5_000,
      limit: limit ? parseInt(limit, 10) : 10,
      hours: hours ? parseInt(hours, 10) : 24,
    });
  }

  /**
   * GET /api/places/photo?ref=...&w=800 — proxy photo Google.
   * Redirige vers l'URL d'image directe (googleusercontent) résolue côté
   * serveur : la clé Google n'est jamais exposée au client. 120/60s.
   * Déclaré AVANT `:id` pour ne pas être capté par la route paramétrée.
   */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('photo')
  async photo(
    @Query('ref') ref: string,
    @Query('w') width: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!ref) {
      res.status(HttpStatus.BAD_REQUEST).end();
      return;
    }
    const url = await this.places.resolvePhotoUrl(ref, width ? parseInt(width, 10) : undefined);
    if (!url) {
      res.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    // Cache navigateur/app : l'URL résolue est stable quelques heures.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.redirect(url);
  }

  /** GET /api/places/:id/stats — avis communautaires agrégés. */
  @Get(':id/stats')
  placeStats(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ loved: number; neutral: number; disliked: number; total: number }> {
    return this.places.placeStats(id);
  }

  /** GET /api/places/:id — détail d'un lieu. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Place> {
    return this.places.findById(id);
  }

  /**
   * POST /api/places/:id/photos — upload d'une photo de lieu (multipart/form-data, champ "photo").
   * Retourne l'URL publique de la photo. 10/60s pour éviter le spam.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/photos')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Format non supporté (jpeg, png, webp, heic).'), false);
        }
      },
    }),
  )
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    if (!file) throw new BadRequestException('Photo manquante.');
    const photoUrl = await this.storage.save(file.buffer, file.originalname, 'places');
    await this.places.addPhoto(id, photoUrl);
    return { photoUrl };
  }

  /** POST /api/places — création (admin uniquement, email dans ADMIN_EMAILS). */
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreatePlaceDto): Promise<Place> {
    return this.places.create(dto);
  }
}
