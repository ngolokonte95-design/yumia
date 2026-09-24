import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isAdminEmail } from '../auth/is-admin-email';
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

/** Types de message dont le fichier joint a été envoyé par l'expéditeur lui-même. */
const OWN_MEDIA_MESSAGE_TYPES = new Set<string>(['image', 'video', 'audio']);

/** Extrait lisible d'un message, pour la file d'attente. */
function messagePreview(type: string, content: string): string {
  if (type === 'text') return content;
  return content ? `[${type}] ${content}` : `[${type}]`;
}

/** Suspension « définitive » : une date si lointaine qu'elle ne reviendra pas. */
export const PERMANENT_YEARS = 100;

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
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!target) throw new NotFoundException('Utilisateur introuvable.');
    // Un admin ne se suspend pas depuis l'app : une erreur de manipulation
    // fermerait le tableau de bord à la seule personne capable de la réparer.
    if (isAdminEmail(target.email)) {
      throw new ForbiddenException('Un compte administrateur ne peut pas être suspendu.');
    }

    const until = new Date();
    if (days && days > 0) until.setDate(until.getDate() + days);
    else until.setFullYear(until.getFullYear() + PERMANENT_YEARS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { suspendedUntil: until, suspendedReason: reason ?? null },
    });
    // Sessions fermées : la personne est déconnectée dès l'expiration de son
    // jeton d'accès, au lieu de rester connectée tant que l'app le renouvelle.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
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
      case 'message': {
        const message = await this.prisma.message
          .findUnique({ where: { id: report.targetId }, select: { content: true, type: true, senderId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: message ? messagePreview(message.type, message.content) : null,
          author: await this.userFull(message?.senderId),
          reporter,
        };
      }
      case 'meetup': {
        const meetup = await this.prisma.meetupEvent
          .findUnique({ where: { id: report.targetId }, select: { title: true, description: true, hostId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: meetup ? [meetup.title, meetup.description].filter(Boolean).join(' — ') : null,
          author: await this.userFull(meetup?.hostId),
          reporter,
        };
      }
      case 'review': {
        const review = await this.prisma.placeReview
          .findUnique({ where: { id: report.targetId }, select: { rating: true, body: true, userId: true } })
          .catch(() => null);
        return {
          ...base,
          preview: review ? `${'★'.repeat(review.rating)} ${review.body ?? ''}`.trim() : null,
          author: await this.userFull(review?.userId),
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
            select: { userId: true, mediaUrls: true, videoUrl: true, coverUrl: true, voiceTrackUrl: true },
          });
          void this.storage.removeMany([
            ...post.mediaUrls,
            post.videoUrl,
            post.coverUrl,
            post.voiceTrackUrl,
          ], post.userId);
          return true;
        }
        case 'comment':
          await this.prisma.postComment.delete({ where: { id } });
          return true;
        case 'story': {
          const story = await this.prisma.story.delete({ where: { id }, select: { userId: true, mediaUrl: true } });
          void this.storage.remove(story.mediaUrl, story.userId);
          return true;
        }
        case 'message': {
          const message = await this.prisma.message.delete({
            where: { id },
            select: { senderId: true, type: true, mediaUrl: true },
          });
          // Seuls les médias ENVOYÉS avec le message lui appartiennent : une
          // réponse à une story pointe sur le fichier de la story d'autrui.
          if (OWN_MEDIA_MESSAGE_TYPES.has(message.type)) {
            void this.storage.remove(message.mediaUrl, message.senderId);
          }
          return true;
        }
        case 'meetup':
          // Les inscriptions (MeetupRsvp) partent en cascade.
          await this.prisma.meetupEvent.delete({ where: { id } });
          return true;
        case 'review': {
          const review = await this.prisma.placeReview.delete({
            where: { id },
            select: { placeId: true, userId: true, photoUrl: true },
          });
          void this.storage.remove(review.photoUrl, review.userId);
          // La note du lieu est la moyenne des avis : un avis retiré ne doit
          // plus la tirer vers le haut ou le bas.
          const agg = await this.prisma.placeReview.aggregate({
            where: { placeId: review.placeId },
            _avg: { rating: true },
          });
          await this.prisma.place.update({
            where: { id: review.placeId },
            data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10 },
          }).catch(() => undefined); // l'avis est retiré même si le lieu a disparu
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
