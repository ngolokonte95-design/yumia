import 'reflect-metadata';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { AppConfig } from './config/configuration';
import { initSentry } from './infra/sentry/sentry.init';

/**
 * Vérifie les variables d'environnement critiques en production.
 * Échoue immédiatement plutôt que de démarrer avec une config dangereuse.
 */
function assertEnv(isProd: boolean): void {
  if (!isProd) return;

  const fatal: string[] = [];

  const jwtAccess = process.env.JWT_ACCESS_SECRET ?? '';
  const jwtRefresh = process.env.JWT_REFRESH_SECRET ?? '';
  const dbUrl = process.env.DATABASE_URL ?? '';

  if (!jwtAccess || jwtAccess === 'change-me-access') {
    fatal.push('JWT_ACCESS_SECRET non configuré ou valeur par défaut.');
  }
  if (!jwtRefresh || jwtRefresh === 'change-me-refresh') {
    fatal.push('JWT_REFRESH_SECRET non configuré ou valeur par défaut.');
  }
  if (!dbUrl) {
    fatal.push('DATABASE_URL manquant.');
  }
  if (process.env.AI_PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    fatal.push('ANTHROPIC_API_KEY manquant alors que AI_PROVIDER=anthropic.');
  }

  if (fatal.length > 0) {
    Logger.error(
      `\n⛔  Démarrage refusé — variables d'environnement critiques manquantes :\n${fatal.map((m) => `  • ${m}`).join('\n')}\n`,
      'Bootstrap',
    );
    process.exit(1);
  }
}

async function bootstrap() {
  // Sentry must be initialized before the app boots so that errors during
  // module initialization are captured.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);
  const isProd = config.get<AppConfig['env']>('env') === 'production';

  assertEnv(isProd);

  // En production l'API est derrière un reverse-proxy (nginx/Caddy).
  // trust proxy = 1 hop : req.ip = X-Forwarded-For[0] → ThrottlerGuard rate-limite par vrai IP client.
  if (isProd) app.set('trust proxy', 1);

  // Corrélation d'ID : chaque requête reçoit un x-request-id unique propagé dans les logs.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('x-request-id', id);
    next();
  });

  // Temps de réponse : utile pour le monitoring APM et les alertes de latence.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      res.setHeader('x-response-time', `${ms.toFixed(2)}ms`);
    });
    next();
  });

  // Limite de taille de corps : 1 Mo max pour prévenir les DoS par gros payload.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  // Sécurité HTTP
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  // Sert les photos uploadées depuis /uploads (fallback disk — remplacé par CDN/S3 quand configuré)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const port = config.get<AppConfig['port']>('port')!;
  const prefix = config.get<AppConfig['globalPrefix']>('globalPrefix')!;
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? [];

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: isProd && allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  app.enableShutdownHooks();

  // Swagger — activé en dev ou si SWAGGER_ENABLED=true
  const swaggerEnabled =
    !isProd || process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('YUMIA API')
      .setDescription('Le Copilote IA Mondial des Expériences du Quotidien')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('auth', 'Authentification & profil utilisateur')
      .addTag('recommendations', 'Recommandations IA')
      .addTag('passport', 'Passeport & gamification')
      .addTag('places', 'Lieux (POI)')
      .addTag('groups', 'Sessions de groupe')
      .addTag('suggestions', 'Suggestions chat IA')
      .addTag('saved', 'Lieux sauvegardés')
      .addTag('health', 'Santé du service')
      .build();

    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'YUMIA API Docs',
    });
    Logger.log(`📖 Swagger disponible sur http://localhost:${port}/${prefix}/docs`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(`🌍 YUMIA API prête sur http://localhost:${port}/${prefix}`, 'Bootstrap');
}

void bootstrap();
