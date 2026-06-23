import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Périodiquement supprime les refresh tokens expirés ou révoqués
 * pour éviter une croissance sans limite de la table RefreshToken.
 */
@Injectable()
export class AuthCleanupCron {
  private readonly logger = new Logger(AuthCleanupCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();

    const [{ count: refreshCount }, { count: resetCount }] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { not: null } },
          ],
        },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null } },
          ],
        },
      }),
    ]);

    const total = refreshCount + resetCount;
    if (total > 0) {
      this.logger.log(
        `Nettoyage : ${refreshCount} refresh token(s) + ${resetCount} reset token(s) supprimés`,
      );
    }
  }
}
