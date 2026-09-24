/**
 * Autorisation d'un appel sortant, gardée en mémoire.
 *
 * L'écran d'appel lance l'appel (caméra et micro allumés) dès son ouverture.
 * Ouvert par un lien `yumia://call?…` venu de l'extérieur, il appelait donc
 * n'importe qui sans confirmation. Seul le bouton d'appel d'une conversation
 * dépose ce jeton ; l'écran d'appel ne démarre que s'il le trouve, et le
 * consomme — un lien ne peut pas le fabriquer.
 */
let pending: { convId: string; partnerId: string } | null = null;

export function allowOutgoingCall(convId: string, partnerId: string): void {
  pending = { convId, partnerId };
}

/** Vrai une seule fois, et seulement pour l'appel autorisé par la conversation. */
export function consumeOutgoingCall(convId?: string, partnerId?: string): boolean {
  const ok = !!pending && pending.convId === convId && pending.partnerId === partnerId;
  pending = null;
  return ok;
}
