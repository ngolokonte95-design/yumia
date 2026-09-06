import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';

export type CallStatus = 'pending' | 'accepted' | 'rejected' | 'ended' | 'missed';
export type CallType   = 'voice' | 'video';

export interface IceCandidate {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface CallRecord {
  id: string;
  callerId: string;
  recipientId: string;
  conversationId?: string;
  type: CallType;
  status: CallStatus;
  senderPublicKey?: string;
  offerSdp?: string;       // SDP offre de l'appelant
  answerSdp?: string;      // SDP réponse de l'appelé
  callerIce: IceCandidate[];
  recipientIce: IceCandidate[];
  createdAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
}

@Injectable()
export class CallsService {
  // In-memory store — les appels sont éphémères (TTL 2h max)
  private readonly calls = new Map<string, CallRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async initiate(
    callerId: string,
    recipientId: string,
    type: CallType,
    conversationId?: string,
    senderPublicKey?: string,
  ): Promise<CallRecord> {
    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { displayName: true, photoUrl: true },
    });

    const call: CallRecord = {
      id: randomUUID(),
      callerId,
      recipientId,
      conversationId,
      type,
      status: 'pending',
      senderPublicKey,
      callerIce: [],
      recipientIce: [],
      createdAt: new Date(),
    };

    this.calls.set(call.id, call);

    // Auto-expire après 60s si non décroché
    setTimeout(() => {
      const c = this.calls.get(call.id);
      if (c && c.status === 'pending') {
        c.status = 'missed';
        c.endedAt = new Date();
        void this.recordCallEvent(c, 'missed');
      }
    }, 60_000);

    // Push notification à l'appelé avec deep link vers l'écran d'appel entrant
    const icon = type === 'video' ? '📹' : '📞';
    const callerName = caller?.displayName ?? 'Quelqu\'un';

    await this.notifications.sendToUser(
      recipientId,
      `${icon} ${type === 'video' ? 'Appel vidéo' : 'Appel vocal'} de ${callerName}`,
      'Appuyez pour répondre',
      {
        path: `/call?callId=${call.id}&convId=${conversationId ?? ''}&partnerId=${callerId}&partnerName=${encodeURIComponent(callerName)}&partnerPhoto=${encodeURIComponent(caller?.photoUrl ?? '')}&type=${type}&incoming=true`,
        callId: call.id,
        type: 'incoming_call',
      },
    );

    return call;
  }

  get(callId: string): CallRecord {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    return call;
  }

  /** L'appelant enregistre son SDP offer (étape WebRTC 1) */
  setOffer(callId: string, callerId: string, offerSdp: string): CallRecord {
    const call = this.calls.get(callId);
    if (!call || call.callerId !== callerId) throw new NotFoundException('Appel introuvable');
    call.offerSdp = offerSdp;
    return call;
  }

  /** L'appelé accepte et enregistre son SDP answer (étape WebRTC 2) */
  accept(callId: string, userId: string, answerSdp?: string): CallRecord {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    if (call.recipientId !== userId) throw new NotFoundException('Non autorisé');
    call.status = 'accepted';
    call.answeredAt = new Date();
    if (answerSdp) call.answerSdp = answerSdp;
    return call;
  }

  /** Ajoute un candidat ICE (les deux côtés peuvent en envoyer) */
  addIceCandidate(callId: string, userId: string, candidate: IceCandidate): CallRecord {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    if (call.callerId === userId) {
      call.callerIce.push(candidate);
    } else if (call.recipientId === userId) {
      call.recipientIce.push(candidate);
    }
    return call;
  }

  /** L'appelé récupère le SDP offer de l'appelant pour créer sa réponse */
  getOffer(callId: string, recipientId: string): { offerSdp?: string } {
    const call = this.calls.get(callId);
    if (!call || call.recipientId !== recipientId) throw new NotFoundException('Appel introuvable');
    return { offerSdp: call.offerSdp };
  }

  /** L'appelant récupère le SDP answer de l'appelé */
  getAnswer(callId: string, callerId: string): { answerSdp?: string; status: string } {
    const call = this.calls.get(callId);
    if (!call || call.callerId !== callerId) throw new NotFoundException('Appel introuvable');
    return { answerSdp: call.answerSdp, status: call.status };
  }

  /** Récupère les candidats ICE du partenaire (polling toutes les ~500ms) */
  getIceCandidates(callId: string, userId: string): { candidates: IceCandidate[] } {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    // L'appelant reçoit les candidats de l'appelé, et vice-versa
    const candidates = call.callerId === userId ? call.recipientIce : call.callerIce;
    return { candidates };
  }

  reject(callId: string, userId: string): CallRecord {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    if (call.recipientId !== userId) throw new NotFoundException('Non autorisé');
    call.status = 'rejected';
    call.endedAt = new Date();
    void this.recordCallEvent(call, 'declined');
    return call;
  }

  end(callId: string, userId: string): CallRecord {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundException('Appel introuvable');
    if (call.callerId !== userId && call.recipientId !== userId) throw new NotFoundException('Non autorisé');
    // Raccroché avant que l'appelé n'ait décroché (côté appelant) : c'est un
    // appel manqué pour l'appelé, pas un appel "terminé" — même si c'est
    // techniquement l'action `end` qui est appelée côté client.
    const wasNeverAnswered = call.status === 'pending';
    call.status = 'ended';
    call.endedAt = new Date();
    void this.recordCallEvent(call, wasNeverAnswered ? 'missed' : 'answered');
    return call;
  }

  /**
   * Persiste l'événement d'appel comme message dans la conversation (fin,
   * manqué ou refusé), pour qu'il apparaisse dans le fil ET dans l'aperçu de
   * la liste des conversations — jusqu'ici les appels étaient entièrement
   * éphémères (Map en mémoire) et ne laissaient aucune trace visible.
   * Best-effort : un échec ne doit jamais faire planter l'appel WebRTC en cours.
   */
  private async recordCallEvent(
    call: CallRecord,
    status: 'missed' | 'answered' | 'declined',
  ): Promise<void> {
    if (!call.conversationId) return;
    try {
      const callDuration = status === 'answered' && call.answeredAt && call.endedAt
        ? Math.max(0, Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000))
        : undefined;
      const contentByStatus: Record<typeof status, string> = {
        missed: 'Appel manqué',
        declined: 'Appel refusé',
        answered: 'Appel terminé',
      };
      await this.prisma.$transaction([
        this.prisma.message.create({
          data: {
            conversationId: call.conversationId,
            senderId: call.callerId,
            content: contentByStatus[status],
            type: 'call',
            callType: call.type,
            callStatus: status,
            callDuration,
          },
        }),
        this.prisma.conversation.update({
          where: { id: call.conversationId },
          data: { updatedAt: new Date() },
        }),
      ]);
    } catch {
      // best-effort — ne doit jamais impacter le déroulement de l'appel
    }
  }
}
