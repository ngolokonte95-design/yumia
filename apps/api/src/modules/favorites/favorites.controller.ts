import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  FavoritesService,
  type FavoriteCollection,
  type FavoriteItem,
  type FavoriteKind,
  type FavoriteSort,
} from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth('access-token')
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  /**
   * GET /api/favorites — liste unifiée (lieux + publications).
   * Filtres : ?collectionId= ?q= ?kind=place|post ?sort=recent|oldest|name
   */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('collectionId') collectionId?: string,
    @Query('q') q?: string,
    @Query('kind') kind?: FavoriteKind,
    @Query('sort') sort?: FavoriteSort,
  ): Promise<FavoriteItem[]> {
    return this.favorites.list(user.sub, { collectionId, query: q, kind, sort });
  }

  /** GET /api/favorites/collections — collections avec décompte par type. */
  @Get('collections')
  listCollections(@CurrentUser() user: JwtPayload): Promise<FavoriteCollection[]> {
    return this.favorites.listCollections(user.sub);
  }

  /** POST /api/favorites/collections — crée une collection. 20/60s. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('collections')
  createCollection(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string },
  ): Promise<FavoriteCollection> {
    return this.favorites.createCollection(user.sub, body.name);
  }

  /** PATCH /api/favorites/collections/:id — renomme une collection. */
  @Patch('collections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async renameCollection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name: string },
  ): Promise<void> {
    await this.favorites.renameCollection(user.sub, id, body.name);
  }

  /** DELETE /api/favorites/collections/:id — supprime la collection, pas son contenu. */
  @Delete('collections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.favorites.deleteCollection(user.sub, id);
  }

  /** PATCH /api/favorites/places/:placeId/collection — range un lieu (null = retire). */
  @Patch('places/:placeId/collection')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPlaceCollection(
    @CurrentUser() user: JwtPayload,
    @Param('placeId') placeId: string,
    @Body() body: { collectionId: string | null },
  ): Promise<void> {
    await this.favorites.setPlaceCollection(user.sub, placeId, body.collectionId ?? null);
  }

  /** PATCH /api/favorites/posts/:postId/collection — range une publication. */
  @Patch('posts/:postId/collection')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPostCollection(
    @CurrentUser() user: JwtPayload,
    @Param('postId') postId: string,
    @Body() body: { collectionId: string | null },
  ): Promise<void> {
    await this.favorites.setPostCollection(user.sub, postId, body.collectionId ?? null);
  }
}
