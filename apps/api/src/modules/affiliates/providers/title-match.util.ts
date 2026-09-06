/**
 * Comparaison de titres pour verifyListing() (GetYourGuide/Viator) — les
 * recherches partenaires renvoient des activités par VILLE (pas par mot-clé
 * libre sur le nom du lieu), donc `totalCount > 0` seul ne prouve rien : une
 * ville avec ne serait-ce qu'une activité fait "passer" n'importe quel lieu.
 * Il faut vérifier qu'au moins un titre réel correspond au nom du lieu.
 */

/** Sans accents/casse — les titres partenaires et nos noms de lieux (Google
 * Places) ne partagent pas forcément la même normalisation Unicode. */
export function normalizeTitle(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * `true` si le nom du lieu et un titre d'activité se recoupent — inclusion
 * dans un sens ou l'autre (un titre partenaire est souvent plus long/orné,
 * ex. "Visite guidée du Verger des Impressionnistes avec audioguide").
 * Approximatif par nature, mais élimine l'essentiel des faux positifs
 * (lieux locaux sans aucune activité partenaire réelle).
 */
export function titleMatchesPlace(title: string, placeName: string): boolean {
  const a = normalizeTitle(title);
  const b = normalizeTitle(placeName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
