/**
 * Faut-il proposer « Voir la traduction » sous un texte ?
 *
 * Pas de bibliothèque ni d'appel réseau : on ne cherche pas à nommer la langue
 * à coup sûr, seulement à ne PAS proposer de traduire un texte déjà dans la
 * langue de l'utilisateur — sinon chaque commentaire porterait le lien.
 *
 * 1. L'alphabet d'abord : un texte en caractères chinois, arabes, cyrilliques
 *    ou devanagari lu par quelqu'un qui n'utilise pas cet alphabet est
 *    forcément à traduire.
 * 2. Entre langues à alphabet latin, les petits mots les plus fréquents
 *    (« le », « the », « der »…) suffisent à trancher sur une phrase. Faute
 *    d'indice, on s'abstient plutôt que d'afficher le lien partout.
 */

type Script = 'latin' | 'han' | 'arabic' | 'cyrillic' | 'devanagari' | 'other';

const LOCALE_SCRIPT: Record<string, Script> = {
  fr: 'latin', en: 'latin', es: 'latin', pt: 'latin', nl: 'latin', it: 'latin', de: 'latin', pl: 'latin', sv: 'latin',
  zh: 'han', ar: 'arabic', ru: 'cyrillic', hi: 'devanagari',
};

/**
 * Plages de caractères explicites plutôt que `\p{Script=…}` : le moteur
 * JavaScript de l'app (Hermes) ne gère pas ces classes Unicode sur toutes les
 * versions, et une expression invalide ferait planter le module au chargement.
 */
function scriptOfChar(c: number): Script | null {
  if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f)) return 'latin';
  if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) return 'han';
  if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) return 'arabic';
  if (c >= 0x0400 && c <= 0x04ff) return 'cyrillic';
  if (c >= 0x0900 && c <= 0x097f) return 'devanagari';
  // Japonais, coréen, grec, hébreu, thaï… : un autre alphabet.
  if ((c >= 0x0370 && c <= 0x03ff) || (c >= 0x0590 && c <= 0x05ff) || (c >= 0x0e00 && c <= 0x0e7f)
    || (c >= 0x3040 && c <= 0x30ff) || (c >= 0xac00 && c <= 0xd7af)) return 'other';
  return null;
}

function scriptOf(text: string): Script | null {
  const counts: Record<Script, number> = { latin: 0, han: 0, arabic: 0, cyrillic: 0, devanagari: 0, other: 0 };
  for (const ch of text) {
    const s = scriptOfChar(ch.codePointAt(0) ?? 0);
    if (s) counts[s]++;
  }
  const best = (Object.entries(counts) as [Script, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 ? best[0] : null;
}

/** Mots-outils très fréquents, propres à chaque langue latine. */
const STOPWORDS: Record<string, string[]> = {
  fr: ['le', 'la', 'les', 'des', 'est', 'et', 'une', 'pour', 'dans', 'avec', 'pas', 'que', 'qui', 'sur', 'trop', 'très', 'je', 'tu', 'nous', 'c\'est'],
  en: ['the', 'and', 'is', 'this', 'that', 'with', 'for', 'you', 'are', 'was', 'have', 'it\'s', 'my', 'so', 'what', 'not', 'love', 'amazing'],
  es: ['el', 'los', 'las', 'que', 'es', 'y', 'una', 'con', 'para', 'por', 'muy', 'pero', 'como', 'está', 'del', 'qué'],
  pt: ['o', 'os', 'as', 'que', 'é', 'e', 'uma', 'com', 'para', 'muito', 'não', 'mas', 'como', 'está', 'do', 'da'],
  it: ['il', 'lo', 'gli', 'che', 'è', 'e', 'una', 'con', 'per', 'molto', 'non', 'ma', 'come', 'sono', 'del', 'della'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'mit', 'für', 'nicht', 'sehr', 'auch', 'ich', 'wir', 'auf'],
  nl: ['de', 'het', 'een', 'en', 'is', 'van', 'met', 'voor', 'niet', 'heel', 'ook', 'maar', 'ik', 'wij', 'op'],
  pl: ['i', 'w', 'na', 'jest', 'to', 'nie', 'się', 'że', 'z', 'bardzo', 'ale', 'jak', 'do', 'czy'],
  sv: ['och', 'är', 'det', 'en', 'ett', 'att', 'med', 'för', 'inte', 'mycket', 'men', 'jag', 'vi', 'på'],
};

function latinLanguage(text: string): string | null {
  const words = text.toLowerCase().split(/[\s.,;:!?¡¿"()«»…\-–—/]+/).filter(Boolean);
  if (words.length === 0) return null;
  const scores = Object.entries(STOPWORDS).map(([lang, list]) => {
    const set = new Set(list);
    return [lang, words.filter((w) => set.has(w)).length] as const;
  });
  scores.sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  // Au moins deux indices, et une avance nette : « de » ou « e » seuls sont
  // partagés par plusieurs langues.
  if (best[1] >= 2 && best[1] > second[1]) return best[0];
  return null;
}

export function shouldOfferTranslation(text: string | null | undefined, locale: string): boolean {
  if (!text || text.trim().length < 4) return false;
  const userScript = LOCALE_SCRIPT[locale.slice(0, 2)] ?? 'latin';
  const script = scriptOf(text);
  if (!script) return false;
  if (script !== userScript) return true;
  if (script !== 'latin') return false;
  const lang = latinLanguage(text);
  return lang !== null && lang !== locale.slice(0, 2);
}
