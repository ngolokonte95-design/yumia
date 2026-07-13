import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CallsService, CallType } from './calls.service';

interface AuthRequest extends Request {
  user: { sub: string };
}

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  /** Initie un appel et envoie une push notification à l'appelé */
  @Post()
  initiate(
    @Req() req: AuthRequest,
    @Body() body: { recipientId: string; type?: string; conversationId?: string; senderPublicKey?: string },
  ) {
    const type: CallType = body.type === 'video' ? 'video' : 'voice';
    return this.calls.initiate(req.user.sub, body.recipientId, type, body.conversationId, body.senderPublicKey);
  }

  /** Polling léger : statut + SDP answer + candidats ICE partenaire */
  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthRequest) {
    const call = this.calls.get(id);
    // Retourne le SDP answer si c'est l'appelant qui poll, l'offer si c'est l'appelé
    const isCallee = call.recipientId === req.user.sub;
    return {
      ...call,
      partnerSdp: isCallee ? call.offerSdp : call.answerSdp,
      partnerIce: isCallee ? call.callerIce : call.recipientIce,
    };
  }

  /** L'appelant envoie son SDP offer après createOffer() */
  @Patch(':id/offer')
  setOffer(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: { sdp: string },
  ) {
    return this.calls.setOffer(id, req.user.sub, body.sdp);
  }

  /** L'appelé accepte et envoie son SDP answer après createAnswer() */
  @Patch(':id/accept')
  accept(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body?: { sdp?: string },
  ) {
    return this.calls.accept(id, req.user.sub, body?.sdp);
  }

  /** Les deux côtés envoient leurs candidats ICE au fil de l'eau */
  @Post(':id/ice')
  addIce(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: { candidate: string; sdpMid?: string; sdpMLineIndex?: number },
  ) {
    return this.calls.addIceCandidate(id, req.user.sub, body);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.calls.reject(id, req.user.sub);
  }

  @Patch(':id/end')
  end(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.calls.end(id, req.user.sub);
  }
}
