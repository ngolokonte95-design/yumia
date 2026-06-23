import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

const SLOW_QUERY_MS = 500;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }],
    });

    (this.$on as (event: 'query', fn: (e: Prisma.QueryEvent) => void) => void)(
      'query',
      (event) => {
        if (event.duration >= SLOW_QUERY_MS) {
          this.logger.warn(
            `Requête lente (${event.duration}ms) : ${event.query.slice(0, 200)}`,
          );
        }
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL connecté');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
