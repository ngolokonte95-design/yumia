import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';

/** Ce qu'on peut décider face à un signalement. */
export type ModerationAction = 'dismiss' | 'delete' | 'suspend' | 'delete_and_suspend';

/**
 * Un signalement, accompagné de ce qu'il vise.
 *
 * Le contenu est joint ici plutôt que chargé écran par écran : sans lui, la
 * file d'attente n'affiche que des identifiants, et modérer devient deviner.
 */
export interface ReportWithTarget {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  createdAt: Date;
  /** Extrait du contenu visé, ou null s'il a déjà disparu. */
  preview: string | null;
  /** Auteur du contenu visé — c'est lui qu'une suspension viserait. */
  author: { id: string; displayName: string; email: string } | null;
  reporter: { id: string; displayName: string } | null;
}

/** Suspension « définitive » : une date si lointaine qu'elle ne reviendra pas. */
const PERMANENT_YEARS = 100;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** File d'attente, du plus ancien au plus récent : l'ordre où il faut traiter. */
  async listReports(status = 'pending', limit = 50): Promise<ReportWithTarget[]> {
    const reports = await this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
    });
    return Promise.all(reports.map((r) => this.withTarget(r)));
  }

  /** Nombre de signalements en attente — pour la pastille du tableau de bord. */
  async pendingCount(): Promise<number> {
    return this.prisma.report.count({ where: { status: 'pending' } });
  }

  /**
   * Traite un signalement de bout en bout.
   *
   * Retirer le contenu sans clore le signalement, ou suspendre sans retirer,
   * sont les deux moitiés d'erreur qu'on commet devant une file d'attente à
   * 2 h du matin. L'action décrit l'intention, le reste suit.
   */
  async resolve(
    reportId: string,
    action: ModerationAction,
    opts: { days?: number; reason?: string } = {},
  ): Promise<{ deleted: boolean; suspendedUntil: Date | null }> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Signalement introuvable.');

    const target = await this.withTarget(report);
    let deleted = false;
    let suspendedUntil: Date | null = null;

    if (action === 'delete' || action === 'delete_and_suspend') {
      deleted = await this.deleteTarget(report.targetType, report.targetId);
    }

    if (action === 'suspend' || action === 'delete_and_suspend') {
      if (!target.author) {
        throw new BadRequestException("L'auteur de ce contenu est introuvable : rien à suspendre.");
      }
      suspendedUntil = await this.suspend(target.author.id, opts.days, opts.reason);
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === 'dismiss' ? 'dismissed' : 'reviewed',
        resolution: action,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(`Signalement ${reportId} : ${action}`);
    return { deleted, suspendedUntil };
  }

  /**
   * Suspend un compte. `days` absent = définitif.
   *
   * On ne supprime pas le compte : la suppression est irréversible et efface
   * aussi les échanges des autres qui y répondaient. Une suspension se lève.
   */
  async suspend(userId: string, days?: number, reason?: string): Promise<Date> {
    const until = new Date();
    if (days && days > 0) until.setDate(until.getDate() + days);
    else until.setFullYear(until.getFullYear() + PERMANENT_YEARS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedUntil: until, suspendedReason: reason ?? null },
    });
    this.logger.log(`Compte ${userId} suspendu jusqu'au ${until.toISOString()}`);
    return until;
  }

  async unsuspend(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedUntil: null, suspendedReason: null },
    });
    this.logger.log(`Compte ${userId} rétabli`);
  }

  /** Comptes actuellement suspendus, pour pouvoir revenir sur une décision. */
  async listSuspended() {
    return this.prisma.user.findMany({
      where: { suspendedUntil: { gt: new Date() } },
      select: {
        id: true,
        displayName: true,
        email: true,
        suspendedUntil: true,
        suspendedReason: true,
      },
      orderBy: { suspendedUntil: 'desc' },
      take: 200,
    });
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  /** Charge le contenu visé et son auteur, selon le type de cible. */
  private async withTarget(report: {
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    details: string | null;
    reporterId: string;
    createdAt: Date;
  }): Promise<ReportWithTarget> {
    const base = {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      createdAt: report.createdAt,
    };

    const reporter = await this.userBrief(report.reporterId);

    switch (report.targetType) {
      case 'post': {
        const post = await this.prisma.post
          .findUnique({ where: { id: report.targetId }, select: { caption: true, userId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: post?.caption ?? null,
          author: await this.userFull(post?.userId),
          reporter,
        };
      }
      case 'comment': {
        const comment = await this.prisma.postComment
          .findUnique({ where: { id: report.targetId }, select: { content: true, userId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: comment?.content ?? null,
          author: await this.userFull(comment?.userId),
          reporter,
        };
      }
      case 'story': {
        const story = await this.prisma.story
          .findUnique({ where: { id: report.targetId }, select: { userId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: story ? '[story]' : null,
          author: await this.userFull(story?.userId),
          reporter,
        };
      }
      case 'user': {
        const user = await this.userFull(report.targetId);
        return { ...base, preview: user?.displayName ?? null, author: user, reporter };
      }
      default:
        return { ...base, preview: null, author: null, reporter };
    }
  }

  private async userBrief(id: string | undefined) {
    if (!id) return null;
    return this.prisma.user
      .findUnique({ where: { id }, select: { id: true, displayName: true } })
      .catch(() => null);
  }

  private async userFull(id: string | undefined) {
    if (!id) return null;
    return this.prisma.user
      .findUnique({ where: { id }, select: { id: true, displayName: true, email: true } })
      .catch(() => null);
  }

  /**
   * Retire le contenu signalé, fichiers compris. `false` s'il avait déjà
   * disparu.
   *
   * Un contenu retiré par la modération est justement celui qu'on ne veut
   * surtout pas laisser accessible par son URL directe.
   */
  private async deleteTarget(type: string, id: string): Promise<boolean> {
    try {
      switch (type) {
        case 'post': {
          const post = await this.prisma.post.delete({
            where: { id },
            select: { mediaUrls: true, videoUrl: true, coverUrl: true, voiceTrackUrl: true },
          });
          void this.storage.removeMany([
            ...post.mediaUrls,
            post.videoUrl,
            post.coverUrl,
            post.voiceTrackUrl,
          ]);
          return true;
        }
        case 'comment':
          await this.prisma.postComment.delete({ where: { id } });
          return true;
        case 'story': {
          const story = await this.prisma.story.delete({ where: { id }, select: { mediaUrl: true } });
          void this.storage.remove(story.mediaUrl);
          return true;
        }
        default:
          // Un signalement visant un compte ne « supprime » rien : c'est la
          // suspension qui agit.
          return false;
      }
    } catch {
      return false; // déjà supprimé entre-temps
    }
  }
}
