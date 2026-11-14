/**
 * Ce qui mène (ou non) à l'abonnement : limite atteinte, page des forfaits
 * ouverte. Envoyé au serveur pour le tableau « Conversion » de l'admin, qui
 * dira quelles limites du Gratuit resserrer ou desserrer.
 *
 * Silencieux et sans effet sur l'écran : un échec réseau n'empêche rien.
 * Une même limite n'est envoyée qu'une fois toutes les 10 minutes — certains
 * écrans recalculent leur message à chaque rendu.
 */
import { getCurrentAccessToken, request } from './api';

export type ConversionEvent = 'limit_hit' | 'paywall_view';

const DEDUPE_MS = 10 * 60_000;
const lastSent = new Map<string, number>();

export function trackConversion(type: ConversionEvent, detail?: string): void {
  const token = getCurrentAccessToken();
  if (!token) return;
  const key = `${type}:${detail ?? ''}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - DEDUPE_MS) return;
  lastSent.set(key, now);
  void request('/conversion/events', { method: 'POST', body: { type, detail }, token }).catch(() => undefined);
}
