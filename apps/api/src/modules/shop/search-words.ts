// Mots de liaison : les exiger écarterait un titre pour une préposition absente.
const STOP_WORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'pour', 'avec', 'au', 'aux', 'sur',
]);

/**
 * Découpe une recherche libre en mots à retrouver tous dans le titre.
 *
 * Les titres AliExpress sont des empilements de mots-clés : « Robe longue
 * d'été rouge femme ». Chercher la phrase entière « robe rouge » d'un bloc ne
 * trouve rien ; chercher chaque mot séparément trouve ce que l'utilisateur
 * voulait dire.
 *
 * Le pluriel final est retiré (« robes » → « robe ») : la recherche se fait par
 * sous-chaîne, donc « robe » retrouve aussi bien « robe » que « robes », alors
 * que « robes » ne retrouverait jamais un titre au singulier.
 */
export function searchWords(q: string | undefined): string[] {
  if (!q) return [];
  const words = q
    .toLowerCase()
    .split(/[\s,;/'’.-]+/)
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
    // Un mot d'une lettre (« à », « d ») filtre au hasard sans rien préciser.
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  // Cinq mots suffisent à cibler un produit ; au-delà, chaque mot ajouté
  // coûte une condition SQL et ne fait qu'exclure des résultats valables.
  return [...new Set(words)].slice(0, 5);
}
