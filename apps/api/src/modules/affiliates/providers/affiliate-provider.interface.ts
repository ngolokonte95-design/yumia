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
  /**
   * Lien tracké générique vers le partenaire (page d'accueil/recherche),
   * sans lieu précis — pour les onglets "Réserver une activité/excursion..."
   * d'Explorer : on ne prétend pas avoir trouvé LE lieu exact, l'utilisateur
   * fait sa propre recherche une fois sur place. Le tracking (`trackingId`)
   * fonctionne identiquement : toute réservation dans la fenêtre d'attribution
   * du partenaire est rémunérée, pas seulement sur ce qui était affiché.
   * `searchTerm` pré-remplit la recherche (ex. "food tour", "airport transfer")
   * pour orienter vers une catégorie sans avoir à l'implémenter côté partenaire.
   */
  generateGenericLink(trackingId: string, searchTerm?: string): string | null;
  /** Extrait un montant (centimes) + devise d'un payload de webhook, si le format le permet. */
  parseConversion?(payload: unknown): { amountCents?: number; currency?: string; clickTrackingId?: string } | null;
  /**
   * Vérifie qu'une fiche correspondant réellement à ce lieu existe chez le
   * partenaire (recherche par nom/ville) — évite d'afficher "Bons plans" un
   * lieu qui n'a en fait aucune fiche réservable, le lien de recherche
   * générique retombant alors sur une page sans rapport.
   * Optionnel : un provider sans implémentation (pas encore d'accès à l'API
   * de recherche du partenaire, distincte de l'ID d'affiliation utilisé pour
   * les liens) est traité comme toujours vérifié — comportement actuel,
   * inchangé tant que la clé n'est pas configurée.
   */
  verifyListing?(place: Pick<Place, 'name' | 'city'>): Promise<boolean>;
  /**
   * `true` si `verifyListing` peut effectuer une VRAIE vérification en ce
   * moment (clé API de recherche présente) — par opposition à un
   * `verifyListing` qui existe mais laisse tout passer faute de clé.
   * Utilisé uniquement par Bons Plans (voir AffiliatesService.getNearbyDeals) :
   * un partenaire sans vérification réelle disponible n'y contribue pas à
   * faire apparaître un lieu, même si son `verifyListing` répondrait "oui"
   * par défaut. Ailleurs (fiche lieu, onglets génériques), ce flag n'est pas
   * utilisé — comportement inchangé, `isConfigured()` suffit.
   */
  hasWorkingVerification?(): boolean;
}
