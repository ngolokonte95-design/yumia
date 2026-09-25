import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { MessageType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { ChatService } from './chat.service';
import { AiService } from '../ai/ai.service';
import { createHash } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';
import { Quota } from '../../common/quota/quota.interceptor';
import { TranslateDto, TRANSLATE_TEXT_MAX, type TranslateLocale } from './dto/translate.dto';

/** 24 h : voir translate() — pas de rétention longue de textes possiblement privés. */
const TRANSLATE_CACHE_TTL_SECONDS = 24 * 60 * 60;

const LOCALE_NAMES: Record<TranslateLocale, string> = {
  fr: 'French', en: 'English', es: 'Spanish', pt: 'Portuguese', ar: 'Arabic',
  nl: 'Dutch', it: 'Italian', de: 'German', pl: 'Polish', sv: 'Swedish',
  zh: 'Chinese', ru: 'Russian', hi: 'Hindi',
};

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly ai: AiService,
    private readonly redis: RedisService,
  ) {}

  /**
   * POST /api/chat/translate — traduit un texte à la demande (bouton "Traduire"
   * sur un message, pas d'appel automatique) pour le clavier multilingue.
   * 30 appels / 60s : traduction courte et peu coûteuse, mais fréquente.
   * Quota quotidien : 200 (Gratuit) / 1 000 (payants) — assez pour tout usage
   * humain, assez bas pour qu'un script ne transforme pas la route en
   * traducteur gratuit.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @Quota({ name: 'translate', perDayByPlan: { free: 200, plus: 1000, gold: 1000, diamond: 1000 } })
  async translate(@Body() dto: TranslateDto): Promise<{ translated: string }> {
    // Sert aussi aux bios, légendes et commentaires (« Voir la traduction ») :
    // le même texte lu par cent personnes n'est traduit qu'une fois.
    const text = (dto.text ?? '').slice(0, TRANSLATE_TEXT_MAX);
    if (!text.trim()) return { translated: '' };
    // Cache 24 h (au lieu de 30 jours) : l'app n'envoie pas encore `context`,
    // on ne sait donc pas distinguer un message privé d'une légende publique.
    // Quand elle enverra context='message', ces textes ne seront plus cachés.
    const cacheable = dto.context !== 'message';
    const cacheKey = `translate:${dto.targetLocale}:${createHash('sha1').update(text).digest('hex')}`;
    if (cacheable) {
      const cached = await this.redis.getJson<string>(cacheKey).catch(() => null);
      if (cached) return { translated: cached };
    }
    const targetName = LOCALE_NAMES[dto.targetLocale];
    const system = [
      `Translate the user's message into ${targetName}.`,
      'Output ONLY the translation, nothing else — no quotes, no explanation, no original text.',
      'If the message is already in that language, return it unchanged.',
    ].join(' ');
    const translated = (await this.ai.freeChat(system, text, 'fast')).trim();
    if (cacheable) {
      await this.redis.setJson(cacheKey, translated, TRANSLATE_CACHE_TTL_SECONDS).catch(() => undefined);
    }
    return { translated };
  }

  /** GET /api/chat/unread-count — conversations non lues (badge de l'onglet Messages). */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.chat.unreadConversations(user.sub) };
  }

  /** GET /api/chat/conversations — liste des conversations */
  @Get('conversations')
  listConversations(@CurrentUser() user: JwtPayload) {
    return this.chat.listConversations(user.sub);
  }

  /** POST /api/chat/conversations — ouvre ou récupère une conv avec un autre user */
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  openConversation(@CurrentUser() user: JwtPayload, @Body('userId') userId: string) {
    return this.chat.getOrCreateConversation(user.sub, userId);
  }

  /** GET /api/chat/conversations/:id — infos du partenaire (1-à-1) ou des participants (groupe). */
  @Get('conversations/:id')
  getConversation(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getConversation(id, user.sub);
  }

  /** GET /api/chat/conversations/:id/messages?before=<iso>&limit=50 */
  @Get('conversations/:id/messages')
  getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.getMessages(id, user.sub, before, limit ? parseInt(limit, 10) : 50);
  }

  /** GET /api/chat/conversations/:id/messages/poll?after=<iso> — long-polling nouveaux messages */
  @Get('conversations/:id/messages/poll')
  pollMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after') after: string,
  ) {
    return this.chat.getNewMessages(id, user.sub, after);
  }

  /** POST /api/chat/conversations/group — créer un groupe de discussion */
  @Post('conversations/group')
  createGroup(@CurrentUser() user: JwtPayload, @Body() dto: { userIds: string[]; title: string }) {
    return this.chat.createGroup(user.sub, dto.userIds ?? [], dto.title);
  }

  /** POST /api/chat/conversations/:id/participants — ajouter des membres au groupe */
  @Post('conversations/:id/participants')
  addParticipants(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { userIds: string[] },
  ) {
    return this.chat.addParticipants(id, user.sub, dto.userIds ?? []);
  }

  /** DELETE /api/chat/conversations/:id/leave — quitter un groupe */
  @Delete('conversations/:id/leave')
  leaveGroup(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.leaveGroup(id, user.sub);
  }

  /** POST /api/chat/conversations/:id/messages — envoyer un message.
   *  Compatibilité : accepte aussi `audioUrl`/`duration` (anciens noms côté mobile). */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  /** Messages éphémères : `ttlSec` en secondes, `null` pour désactiver. */
  @Patch('conversations/:id/ephemeral')
  setEphemeral(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('ttlSec') ttlSec: number | null,
  ) {
    return this.chat.setEphemeral(id, user.sub, ttlSec ?? null);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      content: string; type?: MessageType; mediaUrl?: string; placeId?: string;
      postId?: string; storyId?: string; replyToId?: string; oneTime?: boolean;
      durationSec?: number;
      // alias historiques envoyés par le mobile
      audioUrl?: string; duration?: number;
    },
  ) {
    return this.chat.sendMessage(id, user.sub, {
      content: dto.content,
      type: dto.type,
      mediaUrl: dto.mediaUrl ?? dto.audioUrl,
      placeId: dto.placeId,
      postId: dto.postId,
      storyId: dto.storyId,
      replyToId: dto.replyToId,
      oneTime: dto.oneTime,
      durationSec: dto.durationSec ?? dto.duration,
    });
  }

  /** POST /api/chat/messages/:id/react — réaction emoji (toggle) */
  @Post('messages/:id/react')
  react(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { emoji: string },
  ) {
    return this.chat.toggleReaction(id, user.sub, dto.emoji);
  }

  /** DELETE /api/chat/messages/:id — supprimer un message (réservé à l'expéditeur) */
  @Delete('messages/:id')
  deleteMessage(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.deleteMessage(id, user.sub);
  }

  /** POST /api/chat/messages/:id/viewed-once — consommer un média vue unique */
  @Post('messages/:id/viewed-once')
  viewedOnce(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markOneTimeViewed(id, user.sub);
  }
}
