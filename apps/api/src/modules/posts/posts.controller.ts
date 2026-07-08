import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PostsService } from './posts.service';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  create(@Req() req: any, @Body() body: { caption?: string; mediaUrls: string[]; placeId?: string }) {
    return this.postsService.createPost(req.user.id, body.caption, body.mediaUrls, body.placeId);
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
