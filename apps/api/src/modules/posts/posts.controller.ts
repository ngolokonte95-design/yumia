import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch,
  Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PostsService } from './posts.service';
import { StorageService } from '../../infra/storage/storage.service';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly storage: StorageService,
  ) {}

  /** POST /posts/audio-proxy — télécharge un preview audio depuis un CDN tiers (Deezer, iTunes)
   *  côté serveur et le stocke de façon permanente. Évite les restrictions AVFoundation sur iOS. */
  @Post('audio-proxy')
  async proxyAudio(@Body() dto: { url: string }): Promise<{ url: string }> {
    if (!dto?.url) throw new BadRequestException('url requis');
    let buffer: Buffer;
    try {
      const resp = await fetch(dto.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/*,*/*' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`CDN ${resp.status}`);
      buffer = Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      throw new BadRequestException(`Téléchargement audio échoué : ${(e as Error).message}`);
    }
    const url = await this.storage.save(buffer, 'preview.mp3', 'music');
    return { url };
  }

  /** POST /posts/upload — upload un média (photo, vidéo ou audio) et retourne son URL publique.
   *  Sert aussi bien aux posts/reels/stories qu'aux messages vocaux du chat. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = new Set([
        // images
        'image/jpeg', 'image/png', 'image/webp', 'image/heic',
        // vidéos (reels, stories vidéo)
        'video/mp4', 'video/quicktime', 'video/webm',
        // audio (messages vocaux)
        'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/webm',
      ]);
      cb(null, ok.has(file.mimetype));
    },
  }))
  async uploadMedia(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    const url = await this.storage.save(file.buffer, file.originalname, 'posts');
    return { url };
  }

  @Post()
  create(@Req() req: any, @Body() body: {
    caption?: string; mediaUrls: string[]; placeId?: string; videoUrl?: string; musicTrack?: string;
    taggedUserIds?: string[]; collabUserId?: string; coverUrl?: string;
    commentsDisabled?: boolean; hideLikeCount?: boolean; isDraft?: boolean;
  }) {
    return this.postsService.createPost(req.user.sub, body.caption, body.mediaUrls, {
      placeId: body.placeId,
      videoUrl: body.videoUrl,
      musicTrack: body.musicTrack,
      taggedUserIds: body.taggedUserIds,
      collabUserId: body.collabUserId,
      coverUrl: body.coverUrl,
      commentsDisabled: body.commentsDisabled,
      hideLikeCount: body.hideLikeCount,
      isDraft: body.isDraft,
    });
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.postsService.deletePost(req.user.sub, id);
  }

  @Get('feed')
  feed(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.postsService.getFeed(req.user.sub, limit ? +limit : 30, cursor);
  }

  /** GET /posts/global — feed « Pour vous » : tous les utilisateurs Yumia. */
  @Get('global')
  globalFeed(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.postsService.getGlobalFeed(req.user.sub, limit ? +limit : 30, cursor);
  }

  /** GET /posts/saved — posts enregistrés (option ?collectionId= pour filtrer). */
  @Get('saved')
  savedPosts(@Req() req: any, @Query('limit') limit?: string, @Query('collectionId') collectionId?: string) {
    return this.postsService.getSavedPosts(req.user.sub, limit ? +limit : 30, collectionId);
  }

  /** GET /posts/archived — posts archivés de l'utilisateur. */
  @Get('archived')
  archivedPosts(@Req() req: any, @Query('limit') limit?: string) {
    return this.postsService.getArchived(req.user.sub, limit ? +limit : 30);
  }

  /** GET /posts/drafts — brouillons non publiés. */
  @Get('drafts')
  drafts(@Req() req: any, @Query('limit') limit?: string) {
    return this.postsService.getDrafts(req.user.sub, limit ? +limit : 30);
  }

  /** GET /posts/hashtag/:tag — posts contenant un hashtag. */
  @Get('hashtag/:tag')
  hashtagPosts(@Req() req: any, @Param('tag') tag: string, @Query('limit') limit?: string) {
    return this.postsService.getHashtagPosts(req.user.sub, tag, limit ? +limit : 30);
  }

  /** GET /posts/tagged/:userId — posts où l'utilisateur est identifié. */
  @Get('tagged/:userId')
  taggedPosts(@Req() req: any, @Param('userId') userId: string, @Query('limit') limit?: string) {
    return this.postsService.getTaggedPosts(userId, req.user.sub, limit ? +limit : 30);
  }

  // ── Collections de sauvegardes ─────────────────────────────────────────────

  @Get('collections')
  listCollections(@Req() req: any) {
    return this.postsService.listCollections(req.user.sub);
  }

  @Post('collections')
  createCollection(@Req() req: any, @Body() body: { name: string }) {
    return this.postsService.createCollection(req.user.sub, body.name);
  }

  @Delete('collections/:id')
  deleteCollection(@Req() req: any, @Param('id') id: string) {
    return this.postsService.deleteCollection(req.user.sub, id);
  }

  @Get('user/:userId')
  userPosts(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getUserPosts(userId, req.user.sub, limit ? +limit : 30, cursor);
  }

  // ── Commentaires : like + épinglage (routes avant :id) ─────────────────────

  @Post('comments/:commentId/like')
  toggleCommentLike(@Req() req: any, @Param('commentId') commentId: string) {
    return this.postsService.toggleCommentLike(req.user.sub, commentId);
  }

  @Post('comments/:commentId/pin')
  toggleCommentPin(@Req() req: any, @Param('commentId') commentId: string) {
    return this.postsService.toggleCommentPin(req.user.sub, commentId);
  }

  @Get(':id')
  getPost(@Req() req: any, @Param('id') id: string) {
    return this.postsService.getPost(id, req.user.sub);
  }

  /** PATCH /posts/:id — modifier un post (légende, options). */
  @Patch(':id')
  editPost(@Req() req: any, @Param('id') id: string, @Body() body: {
    caption?: string; placeId?: string | null; taggedUserIds?: string[];
    commentsDisabled?: boolean; hideLikeCount?: boolean; coverUrl?: string;
  }) {
    return this.postsService.editPost(req.user.sub, id, body);
  }

  @Post(':id/pin')
  togglePin(@Req() req: any, @Param('id') id: string) {
    return this.postsService.togglePin(req.user.sub, id);
  }

  @Post(':id/archive')
  toggleArchive(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleArchive(req.user.sub, id);
  }

  @Post(':id/publish')
  publishDraft(@Req() req: any, @Param('id') id: string) {
    return this.postsService.publishDraft(req.user.sub, id);
  }

  @Post(':id/view')
  recordView(@Param('id') id: string) {
    return this.postsService.recordView(id);
  }

  @Get(':id/stats')
  getStats(@Req() req: any, @Param('id') id: string) {
    return this.postsService.getStats(req.user.sub, id);
  }

  @Patch(':id/save-collection')
  setSaveCollection(@Req() req: any, @Param('id') id: string, @Body() body: { collectionId: string | null }) {
    return this.postsService.setSaveCollection(req.user.sub, id, body.collectionId ?? null);
  }

  @Post(':id/like')
  toggleLike(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleLike(req.user.sub, id);
  }

  @Post(':id/save')
  toggleSave(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleSave(req.user.sub, id);
  }

  @Post(':id/repost')
  toggleRepost(@Req() req: any, @Param('id') id: string, @Body() body: { caption?: string }) {
    return this.postsService.toggleRepost(req.user.sub, id, body?.caption);
  }

  @Post(':id/comments')
  addComment(@Req() req: any, @Param('id') id: string, @Body() body: { content: string; parentId?: string }) {
    return this.postsService.addComment(req.user.sub, id, body.content, body.parentId);
  }

  @Delete('comments/:commentId')
  deleteComment(@Req() req: any, @Param('commentId') commentId: string) {
    return this.postsService.deleteComment(req.user.sub, commentId);
  }
}
