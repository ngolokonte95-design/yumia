/**
 * Règles de visibilité entre deux membres, appliquées par le serveur.
 *
 * Avant, chaque écran les réimplémentait (ou les oubliait) : un membre bloqué
 * pouvait encore écrire, appeler, voir les publications et la position de
 * celui qui l'avait bloqué ; un compte privé n'était protégé sur aucune
 * lecture ; Tind montrait des 16-17 ans à des adultes. Toutes les routes qui
 * exposent un membre à un autre passent désormais par ce service.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Âge minimum de Tind et des Rencontres (le reste de l'app est 16+). */
export const DATING_MIN_AGE = 18;

/**
 * Majeur de façon CERTAINE d'après l'année de naissance seule : né il y a au
 * moins 19 ans civils. Un compte sans année (ancien compte) n'est pas
 * considéré majeur — on ne peut pas le vérifier.
 */
export function isAdult(birthYear: number | null | undefined, now = new Date()): boolean {
  return typeof birthYear === 'number' && now.getUTCFullYear() - birthYear - 1 >= DATING_MIN_AGE;
}

/** Filtre Prisma `where` : comptes dont on est sûr qu'ils sont majeurs. */
export function adultBirthYearFilter(now = new Date()) {
  return { birthYear: { not: null, lte: now.getUTCFullYear() - DATING_MIN_AGE - 1 } };
}

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Membres bloqués par `userId` OU qui ont bloqué `userId`. */
  async blockedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [...new Set(rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)))];
  }

  async isBlockedBetween(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const n = await this.prisma.block.count({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    });
    return n > 0;
  }

  /** Lève 403 si l'un a bloqué l'autre. */
  async assertNotBlocked(a: string, b: string): Promise<void> {
    if (await this.isBlockedBetween(a, b)) throw new ForbiddenException('Action impossible avec ce membre');
  }

  /**
   * Le contenu (publications, stories, abonnés…) de `ownerId` est-il visible
   * par `viewerId` ? Soi-même : oui. Blocage dans un sens ou l'autre : non.
   * Compte privé : seulement ses abonnés acceptés.
   */
  async canViewContent(viewerId: string, ownerId: string): Promise<boolean> {
    if (viewerId === ownerId) return true;
    const [owner, blocked] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ownerId }, select: { isPrivate: true } }),
      this.isBlockedBetween(viewerId, ownerId),
    ]);
    if (!owner || blocked) return false;
    if (!owner.isPrivate) return true;
    const follows = await this.prisma.follow.count({ where: { followerId: viewerId, followingId: ownerId } });
    return follows > 0;
  }

  /** 404 (et non 403) : on ne confirme pas l'existence d'un contenu masqué. */
  async assertCanViewContent(viewerId: string, ownerId: string): Promise<void> {
    if (!(await this.canViewContent(viewerId, ownerId))) throw new NotFoundException('Contenu introuvable');
  }

  /**
   * Parmi `ownerIds`, ceux dont `viewerId` peut voir le contenu — version
   * groupée de `canViewContent` pour les fils (une requête par table).
   */
  async visibleOwners(viewerId: string, ownerIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(ownerIds)];
    if (ids.length === 0) return new Set();
    const [blocked, owners, follows] = await Promise.all([
      this.blockedIds(viewerId),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, isPrivate: true } }),
      this.prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: ids } },
        select: { followingId: true },
      }),
    ]);
    const blockedSet = new Set(blocked);
    const followed = new Set(follows.map((f) => f.followingId));
    return new Set(
      owners
        .filter((o) => o.id === viewerId || (!blockedSet.has(o.id) && (!o.isPrivate || followed.has(o.id))))
        .map((o) => o.id),
    );
  }

  /**
   * Auteurs dont `viewerId` ne doit voir aucun contenu dans les fils publics
   * (Pour toi, hashtags, identifications, stories) : blocages dans les deux
   * sens, et comptes privés qu'il ne suit pas.
   */
  async hiddenAuthorIds(viewerId: string): Promise<string[]> {
    const [blocked, follows] = await Promise.all([
      this.blockedIds(viewerId),
      this.prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    ]);
    const privateNotFollowed = await this.prisma.user.findMany({
      where: { isPrivate: true, id: { notIn: [viewerId, ...follows.map((f) => f.followingId)] } },
      select: { id: true },
    });
    return [...new Set([...blocked, ...privateNotFollowed.map((u) => u.id)])];
  }

  /** Tind et Rencontres : 403 si le membre n'est pas majeur de façon certaine. */
  async assertAdult(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } });
    if (!isAdult(u?.birthYear)) {
      throw new ForbiddenException({ code: 'ADULTS_ONLY', message: `Réservé aux ${DATING_MIN_AGE} ans et plus.` });
    }
  }
}
