import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Jeton de refus d'un appel, glissé dans le push d'appel.
 *
 * « Refuser » depuis l'écran verrouillé (CallKit) ou depuis la notification
 * Android se fait en code natif, sans le JS ni le jeton de session de l'app
 * (illisible tant que le téléphone est verrouillé). Ce jeton n'autorise
 * qu'une chose : refuser CET appel, au nom de son destinataire.
 */
function secret(): string {
  return `call-decline:${process.env.JWT_ACCESS_SECRET || ''}`;
}

export function declineToken(callId: string, recipientId: string): string {
  return createHmac('sha256', secret()).update(`${callId}:${recipientId}`).digest('base64url');
}

export function verifyDeclineToken(callId: string, recipientId: string, token: string): boolean {
  if (!token || !process.env.JWT_ACCESS_SECRET) return false;
  const expected = Buffer.from(declineToken(callId, recipientId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
