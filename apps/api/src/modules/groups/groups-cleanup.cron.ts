import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';

// Sessions jamais démarrées après 24 h → supprimées.
const WAITING_TTL_MS = 24 * 60 * 60 * 1000;
// Sessions en vote abandonné après 48 h → supprimées.
const VOTING_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class GroupsCleanupCron {
  private readonly logger = new Logger(GroupsCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupStaleSessions(): Promise<void> {
    const now = new Date();

    const [{ count: waitingCount }, { count: votingCount }] = await Promise.all([
      this.prisma.groupSession.deleteMany({
        where: {
          status: 'waiting',
          createdAt: { lt: new Date(now.getTime() - WAITING_TTL_MS) },
        },
      }),
      this.prisma.groupSession.deleteMany({
        where: {
          status: 'voting',
          createdAt: { lt: new Date(now.getTime() - VOTING_TTL_MS) },
        },
      }),
    ]);

    const total = waitingCount + votingCount;
    if (total > 0) {
      this.logger.log(
        `Nettoyage groupes : ${waitingCount} session(s) waiting + ${votingCount} session(s) voting supprimées`,
      );
    }
  }
}
