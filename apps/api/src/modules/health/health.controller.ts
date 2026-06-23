import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { ElasticsearchService } from '../../infra/elasticsearch/elasticsearch.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly es: ElasticsearchService,
  ) {}

  /** GET /api/health/live — sonde de vivacité (Kubernetes livenessProbe). Toujours 200 si le process tourne. */
  @ApiOperation({ summary: 'Liveness probe — process actif' })
  @Get('live')
  live() {
    return { status: 'alive', service: 'yumia-api', timestamp: new Date().toISOString() };
  }

  @ApiOperation({ summary: 'Readiness probe — Postgres + Redis + Elasticsearch opérationnels' })
  @Get()
  async check() {
    const [db, cache, elasticsearch] = await Promise.all([
      this.pingDb(),
      this.redis.ping(),
      this.es.ping(),
    ]);
    const ok = db && cache && (elasticsearch === null || elasticsearch === true);
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'yumia-api',
      checks: { postgres: db, redis: cache, elasticsearch },
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
