/**
 * Affichage de la note d'un lieu.
 *
 * `rating` est la moyenne des avis laissés par les utilisateurs de YUMIA, plus
 * la note Google (qu'on ne demande plus : elle faisait payer chaque recherche
 * au prix fort). 0 veut dire « personne n'a encore noté » — on n'affiche alors
 * rien plutôt qu'une étoile à 0,0, qui ferait passer le lieu pour mauvais.
 */
export function ratingLabel(rating: number | null | undefined): string {
  return rating && rating > 0 ? `⭐ ${rating.toFixed(1)}` : '';
}

/** « · ⭐ 4.3 » à accoler après un autre élément, ou rien. */
export function ratingSuffix(rating: number | null | undefined): string {
  const label = ratingLabel(rating);
  return label ? ` · ${label}` : '';
}

/** « ⭐ 4.3 · » à placer avant un autre élément, ou rien. */
export function ratingPrefix(rating: number | null | undefined): string {
  const label = ratingLabel(rating);
  return label ? `${label} · ` : '';
}
