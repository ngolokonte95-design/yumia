import type { Place } from '@prisma/client';

export type AffiliateProviderKey =
  | 'booking'
  | 'getyourguide'
  | 'viator'
  | 'fever'
  | 'shotgun'
  | 'trainline'
  | 'treatwell';

/**
 * Contrat commun à tout partenaire d'affiliation. Chaque provider sait
 * générer un lien tracké pour un lieu donné, et peut optionnellement
 * interpréter le payload d'un webhook de conversion partenaire.
 *
 * Un provider dont la clé API n'est pas configurée (`.env.prod`) renvoie
 * `null` depuis `generateBookingLink` — pas d'exception, pas de bouton cassé
 * côté mobile, simplement pas de lien tant que le compte n'est pas prêt.
 */
export interface AffiliateProvider {
  key: AffiliateProviderKey;
  /** Univers pour lesquels ce partenaire est pertinent. */
  universes: readonly string[];
  isConfigured(): boolean;
  generateBookingLink(place: Pick<Place, 'id' | 'name' | 'city' | 'lat' | 'lng'>, trackingId: string): string | null;
  /** Extrait un montant (centimes) + devise d'un payload de webhook, si le format le permet. */
  parseConversion?(payload: unknown): { amountCents?: number; currency?: string; clickTrackingId?: string } | null;
}
