import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RecommendationsService } from '../recommendations/recommendations.service';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(6), (b) => chars[b % chars.length]).join('');
}

export interface GroupMemberView {
  id: string;
  userId: string | null;
  displayName: string | null;
  photoUrl: string | null;
  votes: Record<string, 'like' | 'dislike'>;
  joinedAt: Date;
  votedCount: number;
}

export interface SuggestionView {
  placeId: string;
  name: string;
  universe: string;
  city: string;
  rating: number;
  priceTier: number;
  photoUrl: string | null;
  likes: number;
  dislikes: number;
  score: number;
  myVote: 'like' | 'dislike' | null;
}

export interface GroupSessionView {
  id: string;
  inviteCode: string;
  status: string;
  createdById: string | null;
  createdAt: Date;
  decidedPlaceId: string | null;
  members: GroupMemberView[];
  suggestions: SuggestionView[];
  scores: Array<{ placeId: string; likes: number; dislikes: number; score: number }>;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendations: RecommendationsService,
  ) {}

  /** Crée une session de groupe et y ajoute le créateur comme premier membre. */
  async create(userId: string): Promise<GroupSessionView> {
    let inviteCode: string = generateCode();
    for (let attempt = 0; attempt < 4; attempt++) {
      const exists = await this.prisma.groupSession.findUnique({ where: { inviteCode } });
      if (!exists) break;
      inviteCode = generateCode();
    }

    const session = await this.prisma.groupSession.create({
      data: {
        inviteCode,
        createdById: userId,
        members: { create: { userId } },
      },
      include: { members: { include: { user: true } } },
    });

    return this.toView(session, userId);
  }

  /** Rejoint une session via son code d'invitation. */
  async join(userId: string, inviteCode: string): Promise<GroupSessionView> {
    const session = await this.prisma.groupSession.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { members: { include: { user: true } } },
    });
    if (!session) throw new NotFoundException('Session introuvable ou code invalide.');
    if (session.status === 'done') throw new BadRequestException('Cette session est terminée.');

    const alreadyIn = session.members.some((m) => m.userId === userId);
    if (!alreadyIn) {
      await this.prisma.groupMember.create({ data: { sessionId: session.id, userId } });
      const updated = await this.findSession(session.id);
      return this.toView(updated, userId);
    }

    return this.toView(session, userId);
  }

  /** Lance la recherche IA et passe la session en mode vote. Réservé à l'hôte. */
  async suggest(
    userId: string,
    sessionId: string,
    lat: number,
    lng: number,
    locale: string,
  ): Promise<GroupSessionView> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: { members: { include: { user: true } } },
    });
    if (!session) throw new NotFoundException('Session introuvable.');
    if (session.createdById !== userId) throw new ForbiddenException("Seul l'hôte peut lancer la recherche.");
    if (session.status !== 'waiting') throw new BadRequestException('La recherche a déjà été lancée.');

    const memberCount = session.members.length;
    const result = await this.recommendations.top3({
      lat,
      lng,
      radius: 3000,
      query: `sortie en groupe de ${memberCount} personnes`,
      locale,
    });

    const placeIds = result.suggestions.map((s) => s.place.id);
    const updated = await this.prisma.groupSession.update({
      where: { id: sessionId },
      data: { status: 'voting', suggestions: placeIds },
      include: { members: { include: { user: true } } },
    });
    return this.toView(updated, userId);
  }

  /** Enregistre (ou écrase) le vote d'un membre sur un lieu. */
  async vote(
    userId: string,
    sessionId: string,
    placeId: string,
    vote: 'like' | 'dislike',
  ): Promise<GroupSessionView> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: { members: true },
    });
    if (!session) throw new NotFoundException('Session introuvable.');
    if (session.status !== 'voting') throw new BadRequestException('Le vote n\'est pas ouvert.');

    const member = session.members.find((m) => m.userId === userId);
    if (!member) throw new ForbiddenException('Tu n\'es pas membre de cette session.');

    const currentVotes = (member.votes as Record<string, string>) ?? {};
    const updatedVotes = { ...currentVotes, [placeId]: vote };
    await this.prisma.groupMember.update({ where: { id: member.id }, data: { votes: updatedVotes } });

    // Auto-décider si tous les membres ont voté sur toutes les suggestions
    const suggestionIds = (session.suggestions as string[]) ?? [];
    if (suggestionIds.length > 0) {
      const allMembers = await this.prisma.groupMember.findMany({ where: { sessionId } });
      const allVoted = allMembers.every((m) => {
        const v = (m.userId === userId ? updatedVotes : (m.votes as Record<string, string>)) ?? {};
        return suggestionIds.every((pid) => pid in v);
      });
      if (allVoted) {
        const scores: Record<string, number> = Object.fromEntries(suggestionIds.map((pid) => [pid, 0]));
        for (const m of allMembers) {
          const v = (m.userId === userId ? updatedVotes : (m.votes as Record<string, string>)) ?? {};
          for (const [pid, vt] of Object.entries(v)) {
            if (vt === 'like' && pid in scores) scores[pid]++;
          }
        }
        const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        const decidedPlaceId = winner ? winner[0] : suggestionIds[0];
        await this.prisma.groupSession.update({
          where: { id: sessionId },
          data: { status: 'done', decidedPlaceId },
        });
      }
    }

    const updated = await this.findSession(sessionId);
    return this.toView(updated, userId);
  }

  /** Désigne un lieu gagnant (hôte uniquement). */
  async decide(userId: string, sessionId: string, placeId: string): Promise<GroupSessionView> {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: { members: { include: { user: true } } },
    });
    if (!session) throw new NotFoundException('Session introuvable.');
    if (session.createdById !== userId) throw new ForbiddenException("Seul l'hôte peut désigner le lieu.");

    const updated = await this.prisma.groupSession.update({
      where: { id: sessionId },
      data: { status: 'done', decidedPlaceId: placeId },
      include: { members: { include: { user: true } } },
    });
    return this.toView(updated, userId);
  }

  /** Récupère l'état d'une session (polling). */
  async get(sessionId: string, userId: string): Promise<GroupSessionView> {
    const session = await this.findSession(sessionId);
    const isMember = session.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new ForbiddenException('Tu n\'es pas membre de cette session.');
    return this.toView(session, userId);
  }

  private async findSession(sessionId: string) {
    const session = await this.prisma.groupSession.findUnique({
      where: { id: sessionId },
      include: { members: { include: { user: true } } },
    });
    if (!session) throw new NotFoundException('Session introuvable.');
    return session;
  }

  private async toView(session: any, userId: string): Promise<GroupSessionView> {
    const members: GroupMemberView[] = session.members.map((m: any) => {
      const v = (m.votes as Record<string, 'like' | 'dislike'>) ?? {};
      return {
        id: m.id,
        userId: m.userId ?? null,
        displayName: m.user?.displayName ?? 'Invité',
        photoUrl: m.user?.photoUrl ?? null,
        votes: v,
        joinedAt: m.joinedAt,
        votedCount: Object.keys(v).length,
      };
    });

    // Tally votes across all members
    const tally: Record<string, { likes: number; dislikes: number }> = {};
    for (const member of members) {
      for (const [placeId, vote] of Object.entries(member.votes)) {
        if (!tally[placeId]) tally[placeId] = { likes: 0, dislikes: 0 };
        if (vote === 'like') tally[placeId].likes++;
        else tally[placeId].dislikes++;
      }
    }
    const scores = Object.entries(tally)
      .map(([placeId, { likes, dislikes }]) => ({ placeId, likes, dislikes, score: likes - dislikes }))
      .sort((a, b) => b.score - a.score);

    // Enrich suggestions with place data
    const suggestionIds = (session.suggestions as string[]) ?? [];
    let suggestions: SuggestionView[] = [];
    if (suggestionIds.length > 0) {
      const places = await this.prisma.place.findMany({ where: { id: { in: suggestionIds } } });
      const myVotes = members.find((m) => m.userId === userId)?.votes ?? {};
      suggestions = suggestionIds.flatMap((pid) => {
        const place = places.find((p) => p.id === pid);
        if (!place) return [];
        const t = tally[pid] ?? { likes: 0, dislikes: 0 };
        return [{
          placeId: place.id,
          name: place.name,
          universe: place.universe,
          city: place.city,
          rating: place.rating,
          priceTier: place.priceTier,
          photoUrl: ((place.photoUrls as string[])[0]) ?? null,
          likes: t.likes,
          dislikes: t.dislikes,
          score: t.likes - t.dislikes,
          myVote: (myVotes[pid] as 'like' | 'dislike') ?? null,
        }];
      });
    }

    return {
      id: session.id,
      inviteCode: session.inviteCode,
      status: session.status ?? 'waiting',
      createdById: session.createdById ?? null,
      createdAt: session.createdAt,
      decidedPlaceId: session.decidedPlaceId ?? null,
      members,
      suggestions,
      scores,
    };
  }
}
