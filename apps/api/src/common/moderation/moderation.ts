import { BadRequestException } from '@nestjs/common';

/**
 * Filtrage des contenus publiés par les utilisateurs.
 *
 * Exigence Apple (App Review 1.2, « User-Generated Content ») : une app qui
 * laisse ses utilisateurs publier doit proposer TROIS mécanismes. Le blocage
 * (modèle `Block`) et le signalement (`POST /social/report`) existaient déjà ;
 * ce module apporte le troisième, le filtrage à la publication.
 *
 * Périmètre volontairement étroit : uniquement les insultes graves (racisme,
 * homophobie, menaces, harcèlement sexuel). On ne filtre PAS les gros mots
 * courants — un « c'était de la merde » dans un avis de restaurant est une
 * opinion légitime, et sur-filtrer rend l'app frustrante sans rien apporter
 * en conformité. La modération fine reste humaine, via les signalements.
 */

/**
 * Normalise avant comparaison, pour que les contournements évidents
 * (accents, leetspeak, séparateurs) ne passent pas au travers :
 *   « c-o-n.n@rd » et « çonn4rd » se ramènent tous deux à « connard ».
 */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents (diacritiques combinants, après NFD)
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9\s]/g, ' ') // ponctuation et séparateurs → espace
    .replace(/\s+/g, ' ')
    .trim()
    // Recolle les mots écrits lettre par lettre (« n e g r e ») : après le
    // passage ci-dessus, « n-e-g-r-e » est devenu « n e g r e ». On ne recolle
    // qu'à partir de trois lettres isolées consécutives — du texte français
    // normal n'en enchaîne jamais autant, et le pire cas (« j y a » recollé en
    // « jya ») ne correspond à aucun terme de la liste.
    .replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (run) => run.replace(/ /g, ''));
}

/**
 * Termes bloqués (racines, sans flexion : le motif tolère les suffixes).
 * Liste FR + EN des insultes que les stores considèrent comme
 * « objectionable content » et qu'aucun contexte ne rend acceptables.
 */
const BLOCKED_ROOTS = [
  // Racisme (FR). « raton » est volontairement absent : « raton laveur » est un
  // animal, qui a toute sa place dans un avis sur un zoo ou un parc animalier.
  'negre', 'negresse', 'bougnoule', 'bicot', 'youpin', 'chinetoque',
  // Racisme (EN). « spic » est écarté pour la même raison (« spic and span »).
  'nigger', 'nigga', 'chink', 'kike', 'wetback',
  // Homophobie / transphobie
  'pedale', 'tapette', 'tarlouze', 'faggot', 'tranny',
  // Harcèlement sexuel / dégradation
  'salope', 'putain de merde', 'enculee', 'whore', 'slut',
  // Menaces explicites
  'je vais te tuer', 'va crever', 'kill yourself', 'kys',
];

/**
 * Un motif par racine, ancré sur des frontières de mots.
 *
 * L'ancrage évite le « problème de Scunthorpe » : sans lui, une racine courte
 * bloquerait des mots parfaitement innocents qui la contiennent par hasard.
 *
 * Le suffixe autorisé se limite aux flexions courtes (pluriel et féminin) au
 * lieu d'un `[a-z]*` ouvert : sinon « salope » bloque « salopette », et
 * « pedale » bloque « pedalier » et « pedalo ».
 */
const PATTERNS = BLOCKED_ROOTS.map(
  (root) => new RegExp(`(^|\\s)${root.replace(/\s/g, '\\s')}(?:e|s|es)?($|\\s)`, 'u'),
);

/** Renvoie le premier terme interdit trouvé, ou `null` si le texte est acceptable. */
export function findBlockedTerm(text: string | null | undefined): string | null {
  if (!text) return null;
  const haystack = ` ${normalize(text)} `;
  const index = PATTERNS.findIndex((pattern) => pattern.test(haystack));
  return index === -1 ? null : BLOCKED_ROOTS[index];
}

/** `true` si le texte contient un terme interdit. */
export function isObjectionable(text: string | null | undefined): boolean {
  return findBlockedTerm(text) !== null;
}

/**
 * Rejette la publication si le texte contient un terme interdit.
 *
 * Le message reste volontairement vague : détailler quel mot a déclenché le
 * filtre revient à publier le mode d'emploi pour le contourner.
 */
export function assertClean(text: string | null | undefined): void {
  if (isObjectionable(text)) {
    throw new BadRequestException(
      'Ce contenu enfreint les règles de la communauté YUMIA. Modifie ton texte avant de publier.',
    );
  }
}
