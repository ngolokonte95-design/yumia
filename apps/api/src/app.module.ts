import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { YumiaThrottlerGuard } from './common/guards/throttler.guard';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { ElasticsearchModule } from './infra/elasticsearch/elasticsearch.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PassportModule } from './modules/passport/passport.module';
import { PlacesModule } from './modules/places/places.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SavedModule } from './modules/saved/saved.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    // Structured JSON logging (pino) — pretty en dev, JSON en prod.
    // x-request-id est capturé dans chaque ligne de log pour la traçabilité.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        genReqId: (req) => req.headers['x-request-id'] as string,
        customProps: (req: import('http').IncomingMessage) => ({
          requestId: req.headers['x-request-id'],
        }),
      },
    }),
    // Rate limiting global : 120 req / 60s par IP par défaut (THROTTLE_LIMIT / THROTTLE_TTL pour override)
    // Les endpoints IA utilisent @Throttle({ default: { limit: N, ttl: M } }) pour réduire
    ThrottlerModule.forRootAsync({
      useFactory: () => [{
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
      }],
    }),
    // Infrastructure (globale)
    PrismaModule,
    RedisModule,
    ElasticsearchModule,
    // Cœur IA (global)
    AiModule,
    // Email transactionnel (global)
    MailerModule,
    // Modules métier
    NotificationsModule,
    AuthModule,
    GroupsModule,
    HealthModule,
    PassportModule,
    PlacesModule,
    RecommendationsModule,
    SavedModule,
    SuggestionsModule,
    WebhooksModule,
  ],
  providers: [
    // Rate-limit par utilisateur (sub JWT) avec repli sur IP
    { provide: APP_GUARD, useClass: YumiaThrottlerGuard },
  ],
})
export class AppModule {}
