import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { ChatDto } from './dto/chat.dto';
import { ExperienceDto } from './dto/experience.dto';
import { FeedDto } from './dto/feed.dto';
import { SearchDto } from './dto/search.dto';
import { Top3Dto } from './dto/top3.dto';
import { Quota } from '../../common/quota/quota.interceptor';
import { RecommendationsService, type ExperienceResult, type Top3Result } from './recommendations.service';

/** Recommandations contextuelles : le Top 3 « anti-paralysie du choix ». */
@ApiTags('recommendations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /**
   * POST /api/recommendations/top3 — 3 lieux réels choisis pour le contexte
   * (position, humeur, mode, heure), orchestrés par l'IA + la recherche géo.
   * 20 appels / 60s par IP (appels IA coûteux).
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('top3')
  // Dé Surprise, plus les Top 3 que l'Explorer charge seul à l'ouverture.
  @Quota({ name: 'top3', feature: 'surprisePerDay', margin: 30 })
  @HttpCode(HttpStatus.OK)
  top3(@Body() dto: Top3Dto): Promise<Top3Result> {
    return this.recommendations.top3({
      lat: dto.lat,
      lng: dto.lng,
      radius: dto.radius ?? 3_000,
      city: dto.city,
      mode: dto.mode,
      mood: dto.mood,
      query: dto.query,
      localTimeIso: dto.localTimeIso,
      locale: dto.locale,
      favoriteUniverses: dto.favoriteUniverses,
      universeFilter: dto.universeFilter,
      restrictions: dto.restrictions,
      weather: dto.weather,
    });
  }

  /**
   * POST /api/recommendations/experience — itinéraire 3 étapes (Date / Travel).
   * L'IA assemble la séquence ; on sélectionne les meilleurs lieux réels par étape.
   * 10 appels / 60s (expérience = 3× plus chère qu'un Top 3).
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('experience')
  // Chargé par l'Explorer en mode Date / Voyage, sans compteur dans l'app.
  @Quota({ name: 'experience', feature: 'itineraryPerModePerDay', margin: 20 })
  @HttpCode(HttpStatus.OK)
  experience(@Body() dto: ExperienceDto): Promise<ExperienceResult> {
    return this.recommendations.buildExperience({
      lat: dto.lat,
      lng: dto.lng,
      radius: dto.radius ?? 5_000,
      mode: dto.mode,
      locale: dto.locale,
      favoriteUniverses: dto.favoriteUniverses,
      restrictions: dto.restrictions,
    });
  }

  /**
   * POST /api/recommendations/search — recherche conversationnelle libre.
   * La query utilisateur passe directement au moteur IA mood pour orienter
   * le contexte ; même pipeline de ranking que top3.
   * 15 appels / 60s.
   */
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('search')
  // « Dis-moi ton envie », plus la recherche de lieux des sorties de groupe.
  @Quota({ name: 'search', feature: 'desirePerDay', margin: 10 })
  @HttpCode(HttpStatus.OK)
  search(@Body() dto: SearchDto): Promise<Top3Result> {
    return this.recommendations.top3({
      lat: dto.lat,
      lng: dto.lng,
      radius: dto.radius ?? 5_000,
      query: dto.query,
      locale: dto.locale,
      // If a universe filter is set, scope suggestions to that universe only
      favoriteUniverses: dto.universeFilter
        ? [dto.universeFilter]
        : dto.favoriteUniverses,
      restrictions: dto.restrictions,
      maxPriceTier: dto.maxPriceTier,
    });
  }

  /**
   * POST /api/recommendations/chat — mini-chat IA contextuel sur un lieu.
   * Single-turn : le contexte du lieu est injecté en system prompt pour des
   * réponses précises (horaires, ambiance, conseil d'y aller…).
   * 30 appels / 60s (réponses plus courtes mais interactions fréquentes).
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('chat')
  @Quota({ name: 'place-chat', feature: 'chatbotPerDay' })
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatDto): Promise<{ reply: string }> {
    const system = [
      'Tu es YUMIA, un guide urbain IA passionné et bienveillant.',
      `L'utilisateur est en train de consulter le lieu suivant : "${dto.placeName}" (univers : ${dto.placeUniverse}${dto.placeAddress ? `, adresse : ${dto.placeAddress}` : ''}).`,
      'Réponds en 2-3 phrases maximum, de façon chaleureuse et directe.',
      'Si tu ne connais pas une information précise, dis-le honnêtement sans inventer.',
    ].join(' ');
    const reply = await this.recommendations.chatAboutPlace(system, dto.message);
    return { reply };
  }

  /**
   * POST /api/recommendations/feed — flux For You : lieux réels inspirants,
   * mood-aware, façon découverte verticale.
   * 20 appels / 60s.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('feed')
  // L'app ne compte que les pages suivantes ; premier chargement et
  // rafraîchissements passent par la marge.
  @Quota({ name: 'feed', feature: 'suggestionsPerDay', margin: 30 })
  @HttpCode(HttpStatus.OK)
  feed(@Body() dto: FeedDto): Promise<Top3Result> {
    return this.recommendations.feed({
      lat: dto.lat,
      lng: dto.lng,
      radius: dto.radius ?? 5_000,
      mood: dto.mood,
      limit: dto.limit ?? 15,
      locale: dto.locale,
      favoriteUniverses: dto.favoriteUniverses,
      restrictions: dto.restrictions,
      weather: dto.weather,
    });
  }
}
