/**
 * Compteur d'engagement en version courte : 1 240 → « 1,2 k ».
 *
 * Les compteurs vivent dans une barre d'actions étroite, à côté d'une icône.
 * Un nombre à sept chiffres y pousserait les autres actions hors de l'écran,
 * et personne ne lit « 1 243 891 » — on retient l'ordre de grandeur.
 *
 * La virgule décimale est celle du français : ces textes ne sont pas traduits
 * ailleurs dans la barre non plus (ce sont des chiffres et des icônes).
 */
export function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} k`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
}
