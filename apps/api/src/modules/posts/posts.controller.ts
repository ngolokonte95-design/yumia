import {
  BadRequestException, Body, Controller, Delete, Get, Param,
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

  /** POST /posts/upload — upload une photo et retourne son URL publique. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
      cb(null, ok.has(file.mimetype));
    },
  }))
  async uploadMedia(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    const url = await this.storage.save(file.buffer, file.originalname, 'posts');
    return { url };
  }

  @Post()
  create(@Req() req: any, @Body() body: { caption?: string; mediaUrls: string[]; placeId?: string; videoUrl?: string; musicTrack?: string }) {
    return this.postsService.createPost(req.user.id, body.caption, body.mediaUrls, body.placeId, body.videoUrl, body.musicTrack);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.postsService.deletePost(req.user.id, id);
  }

  @Get('feed')
  feed(@Req() req: any, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.postsService.getFeed(req.user.id, limit ? +limit : 30, cursor);
  }

  @Get('user/:userId')
  userPosts(
    @Req() req: any,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getUserPosts(userId, req.user.id, limit ? +limit : 30, cursor);
  }

  @Get(':id')
  getPost(@Req() req: any, @Param('id') id: string) {
    return this.postsService.getPost(id, req.user.id);
  }

  @Post(':id/like')
  toggleLike(@Req() req: any, @Param('id') id: string) {
    return this.postsService.toggleLike(req.user.id, id);
  }

  @Post(':id/comments')
  addComment(@Req() req: any, @Param('id') id: string, @Body() body: { content: string }) {
    return this.postsService.addComment(req.user.id, id, body.content);
  }

  @Delete('comments/:commentId')
  deleteComment(@Req() req: any, @Param('commentId') commentId: string) {
    return this.postsService.deleteComment(req.user.id, commentId);
  }
}
