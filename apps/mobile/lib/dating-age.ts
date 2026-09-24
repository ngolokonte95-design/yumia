/**
 * Tind et les Rencontres sont réservés aux majeurs (le reste de l'app est
 * 16+). Même règle que le serveur (infra/privacy/privacy.service.ts) : avec
 * la seule année de naissance, on n'est sûr d'avoir 18 ans qu'à 19 ans
 * civils ; sans année renseignée, on ne peut pas le vérifier.
 */
export const DATING_MIN_AGE = 18;

export function isAdultYear(birthYear: number | null | undefined, now = new Date()): boolean {
  return typeof birthYear === 'number' && now.getFullYear() - birthYear - 1 >= DATING_MIN_AGE;
}
