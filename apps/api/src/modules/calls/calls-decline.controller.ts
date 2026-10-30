import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CallsService } from './calls.service';

/**
 * Refus d'un appel depuis la sonnerie native (CallKit, notification Android).
 * Pas de garde JWT : le code natif n'a pas la session de l'app. Le jeton de
 * refus du push (call-token.ts) fait office d'autorisation, pour cet appel seul.
 */
@Controller('calls')
export class CallsDeclineController {
  constructor(private readonly calls: CallsService) {}

  @Post(':id/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(@Param('id') id: string, @Body() body: { token?: string }): void {
    this.calls.declineWithToken(id, String(body?.token ?? ''));
  }
}
