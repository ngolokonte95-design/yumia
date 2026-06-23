import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RedisService } from '../../src/infra/redis/redis.service';
import { ElasticsearchService } from '../../src/infra/elasticsearch/elasticsearch.service';
import { AiService } from '../../src/modules/ai/ai.service';
import type { AppConfig } from '../../src/config/configuration';

// ── Mock factories ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaMock = any;

export function buildPrismaMock(): PrismaMock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    refreshToken: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    passwordResetToken: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    visit: { count: jest.fn(), create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    streak: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    earnedBadge: { findMany: jest.fn(), createMany: jest.fn() },
    savedPlace: { count: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    place: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
    groupSession: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    groupMember: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mock.$transaction.mockImplementation((fn: (p: any) => any) => fn(mock));
  return mock;
}

export const buildRedisMock = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  ping: jest.fn().mockResolvedValue(true),
  getJson: jest.fn().mockResolvedValue(null),
  setJson: jest.fn().mockResolvedValue(undefined),
});

export const buildEsMock = () => ({
  isAvailable: false,
  ping: jest.fn().mockResolvedValue(null),
  indexPlace: jest.fn().mockResolvedValue(undefined),
  geoNearby: jest.fn().mockResolvedValue([]),
  deletePlace: jest.fn().mockResolvedValue(undefined),
  onModuleInit: jest.fn(),
});

export const buildAiMock = () => ({
  runStructured: jest.fn().mockResolvedValue({ reason: 'Bonne soirée', universesSuggested: ['restaurant'] }),
  freeChat: jest.fn().mockResolvedValue('Super endroit !'),
});

// ── App factory ───────────────────────────────────────────────────────────────

export interface TestApp {
  app: INestApplication;
  prisma: ReturnType<typeof buildPrismaMock>;
  jwt: JwtService;
  /** Génère un JWT access token valide pour les tests authentifiés. */
  token(userId?: string): string;
}

export async function createTestApp(): Promise<TestApp> {
  // Disable throttling so rapid test requests are never rate-limited.
  process.env.THROTTLE_SKIP = 'true';

  const prisma = buildPrismaMock();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService).useValue(prisma)
    .overrideProvider(RedisService).useValue(buildRedisMock())
    .overrideProvider(ElasticsearchService).useValue(buildEsMock())
    .overrideProvider(AiService).useValue(buildAiMock())
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const jwt = moduleRef.get(JwtService);
  const config = moduleRef.get(ConfigService);
  const accessSecret = config.get<AppConfig['jwt']>('jwt')?.accessSecret ?? 'dev-access';
  const token = (userId = 'user-e2e') =>
    jwt.sign({ sub: userId, email: 'e2e@yumia.app' }, { secret: accessSecret, expiresIn: '15m' });

  return { app, prisma, jwt, token };
}
