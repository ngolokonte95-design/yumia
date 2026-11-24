import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { assertUsable, CLAUDE_MODEL, claudeTuning, responseText, withHeadroom } from '../ai/claude-model';
import type { ClaudeEffort } from '../ai/claude-model';
import type { Universe } from '@yumia/shared';
import type { AppConfig } from '../../config/configuration';
import { PlacesService } from '../places/places.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Effort de réflexion des appels d'itinéraire.
 *
 * `low` : l'utilisateur attend devant l'écran « YUMIA IA réfléchit… ». En
 * `medium`, la réflexion mangeait tout le plafond de jetons : la réponse
 * arrivait coupée au bout de 15 s, était rejetée, et la trame de repli
 * partait à la place de l'itinéraire écrit par l'IA (24/11/2026).
 */
const ITINERARY_EFFORT: ClaudeEffort = 'low';

export interface ItineraryRequest {
  mood: string;           // 'date' | 'amis' | 'famille' | 'solo' | 'touriste'
  duration: string;       // 'soirée' | 'journée' | 'demi-journée' | 'weekend' | 'semaine'
  budget: string;         // 'économique' | 'moyen' | 'premium'
  city: string;
  interests?: string[];
  groupSize?: number;
  startTime?: string;
  constraints?: string;
}

// ── Rapprochement d'un nom de lieu ──────────────────────────────────────────
//
// L'IA nomme des endroits précis (« Cascade El Limón », « Castillo de Santa
// Bárbara »). Sans ce rapprochement, la résolution ne regardait que le TYPE :
// un moment intitulé « Cascade El Limón » recevait la photo et la note d'une
// balade quelconque de la ville. Le lien était faux, et la carte mensongère.

/**
 * Mots ignorés pour comparer deux noms de lieux.
 *
 * Aux mots vides s'ajoutent les GENRES de lieu (plage, musée, restaurant...),
 * et c'est ce qui fait la différence : « Plage de Las Terrenas » et « Plage de
 * Playa Cosón » ne partagent que le mot « plage », lequel ne dit rien de
 * l'endroit — les compter rapprochait deux plages distinctes. Les écarter
 * laisse « terrenas » face à « cosón », qui tranchent.
 *
 * Effet heureux au passage : « Musée archéologique MARQ » et « Museo
 * Arqueológico MARQ » se rejoignent sur « marq », le seul mot qui les
 * identifie vraiment, sans avoir à traduire quoi que ce soit.
 */
/** Mots vides — français, espagnol, anglais. */
const STOP_WORDS = new Set([
  // Mots vides — français, espagnol, anglais.
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'da', 'del', 'di', 'the',
  'el', 'los', 'las', 'et', 'and', 'y', 'a', 'au', 'aux', 'en', 'sur', 'dans',
  'chez', 'pour', 'par', 'avec', 'san', 'santa', 'saint', 'sainte', 'st',
]);

/**
 * Genres de lieu : présents partout, distinctifs nulle part.
 *
 * Ils servent deux fois : à ne pas rapprocher deux établissements sur le seul
 * mot « glacerie », et à reconnaître un intitulé générique (« Bouchon
 * lyonnais ») que l'IA n'a pas introduit par un article.
 */
const PLACE_GENRES = new Set([
  'bar',
  'beach',
  'bistro',
  'bistrot',
  'bouchon',
  'brasserie',
  'bridge',
  'cafe',
  'cafeteria',
  'calle',
  'cascada',
  'cascade',
  'castillo',
  'castle',
  'center',
  'centre',
  'centro',
  'chateau',
  'church',
  'city',
  'ciudad',
  'club',
  'discotheque',
  'eglise',
  'garden',
  'glace',
  'glacerie',
  'glaces',
  'glacier',
  'gran',
  'grand',
  'grande',
  'hotel',
  'iglesia',
  'jardin',
  'jardines',
  'marche',
  'market',
  'mediterranee',
  'mercado',
  'musee',
  'museo',
  'museum',
  'old',
  'parc',
  'park',
  'parque',
  'petit',
  'petite',
  'place',
  'plage',
  'playa',
  'plaza',
  'pont',
  'port',
  'principal',
  'puente',
  'puerto',
  'restaurant',
  'restaurante',
  'rue',
  'street',
  'table',
  'taverne',
  'torre',
  'tour',
  'tower',
  'vieille',
  'vieux',
  'ville',
  'waterfall',
]);

/**
 * Qualificatifs administratifs : ils disent QUI tient le lieu, pas lequel.
 *
 * « Mercado Municipal » et « Ayuntamiento Municipal » ne partagent que
 * « municipal » : compté, il rapprochait le marché de la mairie, et une
 * étape « Marché local » s'est affichée sur la photo de l'hôtel de ville de
 * Las Terrenas (24/11/2026).
 */
const ADMIN_QUALIFIERS = new Set([
  'municipal', 'municipale', 'municipalidad', 'municipio',
  'nacional', 'national', 'nationale', 'publico', 'publica', 'public', 'publique',
]);

const NAME_NOISE = new Set([...STOP_WORDS, ...PLACE_GENRES, ...ADMIN_QUALIFIERS]);

/** Le nom entier, sans accents ni ponctuation — pour l'égalité stricte. */
function flatName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !NAME_NOISE.has(w)),
  );
}

/**
 * `true` si deux noms désignent visiblement le même endroit.
 *
 * Le recouvrement est rapporté au PLUS COURT des deux : l'IA écrit souvent un
 * intitulé enrichi (« Castillo de Santa Bárbara & Barrio de la Santa Cruz »)
 * là où la base ne porte que « Castillo de Santa Bárbara ».
 */
function headSegment(name: string): string {
  // Seuls les tirets ENTOURES d'espaces separent : « Saint-Louis » et
  // « Aix-en-Provence » doivent rester entiers.
  return name.split(/\s[–—-]\s|,|\(/)[0] ?? name;
}

export function namesMatch(a: string, b: string, city?: string): boolean {
  // Deux noms identiques désignent le même lieu, même quand ils ne sont faits
  // que de mots ignorés plus bas (« Mercado Municipal »).
  const flatA = flatName(a);
  if (flatA && flatA === flatName(b)) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const head = nameTokens(headSegment(a));

  // Tous les candidats viennent d'une recherche DANS cette ville : son nom n'y
  // distingue donc rien, par construction. Sans cette coupe, « Musée
  // d'Histoire de Marseille » se rapprochait de « Musée Subaquatique de
  // Marseille » — deux musées différents, rapprochés par le seul mot
  // « Marseille », « musée » étant déjà tenu pour non distinctif.
  if (city) {
    for (const w of nameTokens(city)) {
      ta.delete(w);
      tb.delete(w);
      // La tête aussi : sans ça, elle gardait « terrenas » quand le nom
      // complet l'avait perdu, les deux tailles se trouvaient égales par
      // hasard, et le contrôle de la tête plus bas était sauté.
      head.delete(w);
    }
  }

  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  if (shared / Math.min(ta.size, tb.size) < 0.5) return false;

  // Le recouvrement rapporte au plus court accepte un nom entierement contenu
  // dans l'autre. C'est voulu quand le nom court est la TETE de l'intitule
  // (« Castillo de Santa Barbara » dans « Castillo … & Barrio … »), mais c'est
  // faux quand il n'en est que le SUFFIXE : l'IA situe ses etapes par leur
  // quartier, et « Le Sergent Recruteur – Ile Saint-Louis » se rapprochait
  // alors du lieu nomme « Ile Saint-Louis » — l'ile elle-meme. La photo
  // montrait une rue, la description parlait d'un restaurant aux chandelles.
  //
  // On exige donc que la correspondance touche la tete de l'intitule, pas
  // seulement le complement de lieu qui la suit.
  if (head.size > 0 && head.size !== ta.size) {
    let touchesHead = false;
    for (const w of head) if (tb.has(w)) touchesHead = true;
    if (!touchesHead) return false;
  }

  // Un SEUL mot commun entre deux noms d'au moins deux mots ne prouve rien
  // quand ce mot est la categorie ou la geographie : « Glacerie Peron » et
  // « Glacerie La Cigale » sont deux glaciers differents, « Musee … de la
  // Mediterranee » et « Cosquer Mediterranee » deux musees differents.
  //
  // Sauf si ce qui reste se ressemble : « Cascade El Limon » et « Cascada El
  // Limon » ne partagent aussi qu'un mot, mais « cascade » et « cascada » sont
  // le meme mot dans deux langues. C'est cette variante-la qu'on veut garder.
  return true;
}

/**
 * Déterminants qui ouvrent un intitulé GÉNÉRIQUE (« Un bar à cocktails »,
 * « Une table du centre »). Leur présence en tête signale que l'IA a décrit un
 * GENRE d'endroit, pas un endroit.
 */
const GENERIC_OPENERS = new Set(['un', 'une', 'des', 'du', 'le', 'la', 'les', 'l', 'a']);

/**
 * `true` si le nom désigne un genre de lieu plutôt qu'un lieu précis.
 *
 * Cette distinction décide de ce qu'on a le droit de rattacher à une étape.
 * « Un dîner romantique » n'engage rien : n'importe quel bon restaurant de la
 * ville fait l'affaire, et son nom peut même remplacer l'intitulé. « Real
 * Alcázar » engage tout : lui substituer un autre monument produit exactement
 * ce que l'utilisateur nous a signalé — une photo, une note et un lien qui ne
 * parlent pas du lieu décrit juste au-dessus.
 *
 * Le critère est l'attaque de l'intitulé : un déterminant indéfini ou défini
 * introduit une catégorie, une majuscule ou un mot plein introduit un nom.
 */
/** Minuscules sans accents — la forme sous laquelle les listes sont écrites. */
function normalizeWord(word: string): string {
  return word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function isGenericName(name: string): boolean {
  // L'attaque de l'intitulé : un article, puis la première lettre du mot
  // suivant — séparés par une espace (« Un bar ») ou par une élision
  // (« L'apéro »).
  const head = name.trim().match(/^(\p{L}+)(?:['’]\s*|\s+)(\p{L})/u);
  if (!head) return false;

  // Deuxième porte : l'IA n'introduit pas toujours par un article. « Bouchon
  // lyonnais – Quartier Saint-Jean » et « Bar à cocktails » décrivent un genre
  // sans le dire, et rester sourd à ces intitulés-là laissait des itinéraires
  // entiers sans la moindre photo.
  //
  // La garantie reste la même que pour l'article : AUCUNE majuscule après le
  // premier mot. « Restaurant El Cabito », « Musée des Civilisations » et
  // « Glacier Terre de Glace » nomment des endroits précis, et le disent par
  // leurs majuscules.
  if (PLACE_GENRES.has(normalizeWord(head[1]))) {
    const rest = headSegment(name).trim().split(/\s+/).slice(1);
    return rest.every((w) => w[0] === w[0].toLowerCase());
  }

  const article = normalizeWord(head[1]);
  if (!GENERIC_OPENERS.has(article)) return false;

  // L'article ne suffit pas à trancher : « La Boqueria » et « L'Atelier de
  // Joël » sont des enseignes, « Le musée principal » est une catégorie. La
  // majuscule du mot suivant est le seul indice qui les sépare, et se tromper
  // ne coûte qu'une résolution par nom au clic — pas une carte mensongère.
  return head[2] === head[2].toLowerCase();
}

/**
 * Types de lieu (Google) que l'on ne propose JAMAIS de soi-même.
 *
 * Quand une étape ne nomme qu'un genre (« Un monument incontournable »), on la
 * comble avec un lieu de l'univers correspondant. Or ces univers ramassent ce
 * que le fournisseur y range : à Las Terrenas, l'univers « monument »
 * contenait le cimetière municipal, et « point de vue » une station-service
 * et une quincaillerie. Le 24/11/2026, un itinéraire s'ouvrait ainsi sur
 * « Cementerio Municipal — Commence par un lieu emblématique de la ville ».
 *
 * La liste ne vise que le choix PAR DÉFAUT. Un lieu que l'IA nomme
 * expressément (le Père-Lachaise, un cimetière qui se visite) reste rattaché
 * par son nom : c'est alors une décision, pas un hasard de classement.
 */
const UNFIT_TAGS = new Set([
  'atm',
  'bank',
  'car_dealer',
  'car_repair',
  'car_wash',
  'cemetery',
  'courthouse',
  'dentist',
  'doctor',
  'funeral_home',
  'gas_station',
  'general_contractor',
  'hardware_store',
  'hospital',
  'insurance_agency',
  'parking',
  'pharmacy',
  'police',
  'real_estate_agency',
  'storage',
]);

/** Second filet, pour un lieu importé sans types : le nom dit parfois tout. */
const UNFIT_NAME =
  /\b(cementerio|cimetiere|cemetery|friedhof|cimitero|cemiterio|funeraire|funeraria|funeral|tanatorio)\b/;

/** `false` pour un lieu qu'on ne doit pas proposer comme étape par défaut. */
export function isFitForItinerary(place: { name: string; tags?: string[] | null }): boolean {
  if ((place.tags ?? []).some((tag) => UNFIT_TAGS.has(tag))) return false;
  return !UNFIT_NAME.test(normalizeWord(place.name));
}

/** Un lieu tel que renvoyé par PlacesService — dérivé pour ne pas diverger. */
type PlaceCandidate = Awaited<ReturnType<PlacesService['searchByCity']>>[number];

/** Lieu réel de la base, rattaché à une étape ou à un moment. */
interface ResolvedPlace {
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
  /**
   * Le nom du lieu rattaché. Le titre de l'étape est celui du modèle
   * (« Déjeuner caribéen au bord de l'eau ») : sans ce nom, la carte ne
   * disait pas où aller, et la fiche ouverte depuis l'étape portait le
   * titre de l'étape au lieu du nom du restaurant (24/11/2026).
   */
  placeName?: string;
}

/**
 * Un moment à l'intérieur d'une journée (matin, déjeuner, après-midi, soir).
 *
 * N'existe qu'en mode semaine : une étape y couvre un jour entier, et sa
 * description mentionne plusieurs endroits dont un seul était cliquable.
 * Les moments rendent la journée parcourable, chacun avec son propre lieu.
 */
export interface ItineraryMoment extends ResolvedPlace {
  time: string;
  type: string;
  name: string;
  description: string;
  emoji: string;
  tips?: string;
  /**
   * Le lieu que le modèle a choisi, sous son nom EXACT (voir
   * `knownPlacesBlock`). `""` : l'étape n'est pas un lieu précis. Absent :
   * trame de repli ou ancienne réponse, le titre sert alors à la recherche.
   * Usage interne : retiré avant de répondre à l'app.
   */
  place?: string;
  /**
   * `true` quand le modèle a dit que l'étape n'est pas un lieu précis
   * (flânerie dans un quartier…) : l'app n'y propose pas « Voir ce lieu »,
   * qui aurait cherché — et payé — un lieu au nom de la balade.
   */
  noPlace?: true;
}

export interface ItineraryStep extends ResolvedPlace {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
  /** Voir `ItineraryMoment.place`. */
  place?: string;
  /** Voir `ItineraryMoment.noPlace`. */
  noPlace?: true;
  /** Découpage de la journée — mode semaine uniquement. */
  moments?: ItineraryMoment[];
}

const MOOD_CONTEXT: Record<string, string> = {
  date: 'Crée une expérience romantique et mémorable pour un couple. Privilégie les ambiances intimistes, les restaurants avec une belle atmosphère, les balades au coucher de soleil, les bars à cocktails cosy. Évite les activités bruyantes ou familiales.',
  famille: 'Crée une sortie adaptée aux enfants et aux parents. Inclus des activités ludiques, des musées interactifs, des parcs, des restaurants familiaux avec menu enfant. Prévois des pauses, du temps libre. Évite les bars et clubs.',
  touriste: 'Crée un programme qui mélange les incontournables et les pépites locales moins connues. Diversité culturelle : architecture, gastronomie locale, marchés, street art, vue panoramique. Rythme soutenu mais agréable.',
  amis: 'Crée une sortie conviviale et festive pour un groupe d\'amis. Mix activités, bonne bouffe, verres entre amis. Peut inclure bar, bowling, soirée selon l\'heure.',
  solo: 'Crée une expérience enrichissante pour une personne seule. Café pour lire/travailler, musée à son rythme, restaurant solo-friendly, balade contemplative, librairie.',
};

const STEP_TYPE_TO_UNIVERSE: Record<string, Universe> = {
  restaurant: 'restaurant',
  diner: 'restaurant',
  repas: 'restaurant',
  brunch: 'brunch',
  café: 'cafe',
  cafe: 'cafe',
  coffee: 'cafe',
  bar: 'bar',
  cocktail: 'bar',
  apéro: 'bar',
  aperitif: 'bar',
  boisson: 'bar',
  musée: 'museum',
  museum: 'museum',
  exposition: 'museum',
  culture: 'cultural_outing',
  culturel: 'cultural_outing',
  theatre: 'cultural_outing',
  théâtre: 'cultural_outing',
  shopping: 'shopping',
  boutique: 'shopping',
  parc: 'park',
  park: 'park',
  nature: 'park',
  balade: 'park',
  cinema: 'cinema',
  film: 'cinema',
  nightclub: 'nightclub',
  club: 'nightclub',
  discothèque: 'nightclub',
  glace: 'ice_cream',
  glacier: 'ice_cream',
  dessert: 'dessert',
  pâtisserie: 'bakery',
  boulangerie: 'bakery',
  bakery: 'bakery',
  monument: 'monument',
  tourisme: 'tourist_activity',
  activité: 'tourist_activity',
  photo: 'photo_spot',
  viewpoint: 'photo_spot',
  panorama: 'photo_spot',
};

function stepTypeToUniverse(type: string): Universe | null {
  const key = type.toLowerCase().trim();
  return STEP_TYPE_TO_UNIVERSE[key] ?? null;
}

/**
 * Univers dont les lieux sont montrés au modèle AVANT qu'il écrive.
 *
 * Sans liste, il nommait les établissements de mémoire — et, pour une petite
 * ville, il en inventait : « Café Bonito » et « Rancho Pelo Malo » à Las
 * Terrenas (24/11/2026), absents de notre base comme de Google. Leurs cartes
 * restaient sans photo et envoyaient le voyageur vers une adresse qui
 * n'existe pas. Ce sont, à peu de chose près, les univers que la trame de
 * repli du même mood interroge déjà : la liste ne coûte presque aucune
 * recherche de plus, et ce qui est trouvé sert ensuite au rattachement.
 */
const MOOD_UNIVERSES: Record<string, Universe[]> = {
  touriste: ['monument', 'museum', 'restaurant', 'cafe', 'photo_spot', 'tourist_activity'],
  date: ['restaurant', 'bar', 'photo_spot', 'dessert', 'cafe'],
  amis: ['brunch', 'restaurant', 'bar', 'tourist_activity', 'nightclub'],
  famille: ['tourist_activity', 'restaurant', 'park', 'ice_cream', 'museum'],
  solo: ['cafe', 'museum', 'restaurant', 'park', 'bakery'],
};
const DEFAULT_UNIVERSES: Universe[] = ['restaurant', 'cafe', 'bar', 'monument', 'photo_spot', 'tourist_activity'];

/** Le type d'étape, dans le vocabulaire du modèle, qui désigne chaque univers. */
const UNIVERSE_STEP_TYPE: Partial<Record<Universe, string>> = {
  restaurant: 'restaurant',
  brunch: 'brunch',
  cafe: 'cafe',
  bar: 'bar',
  museum: 'musée',
  monument: 'monument',
  photo_spot: 'photo',
  tourist_activity: 'activité',
  park: 'parc',
  ice_cream: 'glace',
  dessert: 'dessert',
  bakery: 'boulangerie',
  nightclub: 'nightclub',
};

/** Lieux montrés par univers : assez pour choisir, peu pour le coût. */
const KNOWN_PLACES_PER_UNIVERSE = 12;

/**
 * Le bloc de consigne qui donne au modèle les vrais lieux de la ville.
 *
 * Vide quand la base ne connaît rien de la ville : le modèle écrit alors
 * comme avant, et la résolution par le fournisseur prend le relais.
 */
export function knownPlacesBlock(
  city: string,
  lists: Array<{ universe: Universe; places: Array<{ name: string; address?: string | null }> }>,
): string {
  const entry = (p: { name: string; address?: string | null }): string => {
    const where = shortAddress(p.address, city);
    return where ? `${p.name} [${where}]` : p.name;
  };
  const lines = lists
    .filter((l) => l.places.length > 0)
    .map((l) => `- ${UNIVERSE_STEP_TYPE[l.universe] ?? l.universe} : ${l.places.map(entry).join(' ; ')}`);
  if (lines.length === 0) return '';
  return `LIEUX RÉELS de ${city}, tirés de notre base (chacun a sa fiche et ses photos). Entre crochets, la rue ou le quartier :
${lines.join('\n')}

Règles pour le champ "place" :
- Une étape qui se passe dans un établissement (restaurant, café, bar, glacier, boutique, activité…) le choisit DANS CETTE LISTE et recopie son nom EXACT dans "place", sans les crochets.
- Une plage, un site naturel ou un monument célèbre absent de la liste : tu peux le mettre dans "place" seulement si tu es CERTAIN qu'il existe sous ce nom.
- Une étape qui n'est pas un lieu précis (flânerie dans un quartier…) : "place" vaut "".
- N'invente JAMAIS un nom d'établissement.

Pour la description d'un lieu de la liste : ne le situe (près d'une plage, dans un quartier, face à la mer) que d'après ses crochets, et ne lui prête rien de précis (sa cuisine, ses plats, sa vue) que son nom ou ses crochets ne disent pas.`;
}

/** Retire l'adresse entre crochets que le modèle recopie parfois avec le nom. */
export function withoutAddress(place: string): string {
  return place.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

/**
 * La rue ou le quartier d'un lieu, tirés de son adresse complète :
 * « Calle Duarte » pour « Calle Duarte, Las Terrenas 32000, République
 * dominicaine ». Le modèle ne connaissait que les noms, et situait les
 * lieux au jugé (« près de la plage de Cosón », 24/11/2026).
 */
export function shortAddress(address: string | null | undefined, city: string): string {
  if (!address) return '';
  const cityKey = flatName(city);
  const kept: string[] = [];
  for (const raw of address.split(',')) {
    // Un Plus Code (« 8MRC+X2 Playa Cosón ») ne dit rien à un lecteur : on
    // garde ce qui le suit.
    const part = raw.trim().replace(/^[0-9A-Z]{4,}\+[0-9A-Z]{2,}\s*/, '');
    if (!part) continue;
    // La ville, le code postal et le pays n'apprennent rien de plus.
    if (cityKey && flatName(part).includes(cityKey)) break;
    if (/\d{4,}/.test(part)) break;
    kept.push(part);
    if (kept.length === 2) break;
  }
  const out = kept.join(', ');
  return out.length > 48 ? `${out.slice(0, 47)}…` : out;
}

/**
 * Séquences de repli par mood — utilisées quand l'IA est indisponible (pas de
 * clé) ou échoue. Chaque étape sera enrichie d'un vrai lieu via PlacesService,
 * donc le `name` générique n'apparaît que si aucun lieu n'est trouvé.
 * On garde une trame « journée » complète ; `sliceForDuration` la raccourcit.
 */
const FALLBACK_SEQUENCES: Record<string, ItineraryStep[]> = {
  date: [
    { time: '19h00', type: 'bar', name: 'Un bar à cocktails', description: "L'apéro pour démarrer la soirée en douceur.", duration: '1h', emoji: '🍸', tips: 'Réserve une table au calme.' },
    { time: '20h30', type: 'restaurant', name: 'Un dîner romantique', description: 'Un restaurant à l\'ambiance intimiste pour deux.', duration: '1h30', emoji: '🍽️', tips: 'Demande une table à l\'écart.' },
    { time: '22h30', type: 'photo', name: 'Un point de vue', description: 'Une vue pour finir la soirée en beauté.', duration: '45min', emoji: '🌆' },
  ],
  amis: [
    { time: '11h00', type: 'brunch', name: 'Un brunch convivial', description: 'On se retrouve autour d\'un bon brunch.', duration: '1h30', emoji: '🥐' },
    { time: '14h00', type: 'activité', name: 'Une activité de groupe', description: 'De quoi s\'amuser tous ensemble.', duration: '2h', emoji: '🎯' },
    { time: '20h00', type: 'restaurant', name: 'Un resto entre amis', description: 'Bonne bouffe et bonne ambiance.', duration: '1h30', emoji: '🍽️' },
    { time: '22h00', type: 'bar', name: 'Un dernier verre', description: 'On prolonge la soirée autour d\'un verre.', duration: '1h30', emoji: '🍹' },
  ],
  famille: [
    { time: '10h00', type: 'activité', name: 'Une sortie ludique', description: 'Une activité qui plaît aux petits comme aux grands.', duration: '2h', emoji: '🎡' },
    { time: '12h30', type: 'restaurant', name: 'Un déjeuner familial', description: 'Un restaurant avec menu enfant.', duration: '1h15', emoji: '🍽️' },
    { time: '14h30', type: 'parc', name: 'Un parc', description: 'Une pause au grand air pour se dépenser.', duration: '1h30', emoji: '🌳' },
    { time: '16h30', type: 'glace', name: 'Un goûter glacé', description: 'Une glace pour finir la journée en douceur.', duration: '45min', emoji: '🍦' },
  ],
  solo: [
    { time: '10h00', type: 'cafe', name: 'Un café cosy', description: 'Un café pour lire ou travailler à ton rythme.', duration: '1h', emoji: '☕' },
    { time: '11h30', type: 'musée', name: 'Un musée', description: 'Une visite culturelle à ton propre tempo.', duration: '2h', emoji: '🖼️' },
    { time: '13h30', type: 'restaurant', name: 'Un déjeuner solo-friendly', description: 'Un bon repas, seul(e) mais bien accompagné(e) d\'un livre.', duration: '1h', emoji: '🍽️' },
    { time: '15h00', type: 'balade', name: 'Une balade contemplative', description: 'Une promenade pour respirer et flâner.', duration: '1h30', emoji: '🚶' },
  ],
  touriste: [
    { time: '10h00', type: 'monument', name: 'Un monument incontournable', description: 'Commence par un lieu emblématique de la ville.', duration: '1h30', emoji: '🏛️' },
    { time: '11h30', type: 'musée', name: 'Un musée', description: 'Plonge dans la culture locale.', duration: '2h', emoji: '🖼️' },
    { time: '13h30', type: 'restaurant', name: 'Une spécialité locale', description: 'Goûte la cuisine du terroir comme un local.', duration: '1h15', emoji: '🍽️' },
    { time: '15h00', type: 'cafe', name: 'Une pause café', description: 'Un café comme les habitants du coin.', duration: '45min', emoji: '☕' },
    { time: '16h30', type: 'photo', name: 'Un point de vue', description: 'Le meilleur panorama pour tes photos.', duration: '1h', emoji: '📸' },
  ],
};

/** Nombre d'étapes retenues selon la durée choisie. */
function stepCountForDuration(duration: string): number {
  switch (duration) {
    case 'demi-journée': return 3;
    case 'soirée': return 3;
    case 'journée': return 5;
    case 'weekend': return 5;
    case 'semaine': return 7;
    default: return 4;
  }
}

/**
 * Itinéraire "semaine" : une recommandation par jour (pas d'horaire précis à
 * l'échelle d'un jour entier). Trame de repli générique pour le mode Voyage,
 * utilisée si l'IA est indisponible.
 */
const WEEK_FALLBACK: ItineraryStep[] = [
  { time: 'Jour 1', type: 'monument', name: 'Découverte des incontournables', description: 'Premier contact avec la ville : ses monuments et sites emblématiques.', duration: 'Journée', emoji: '🏛️',
    moments: [
      { time: 'Matin', type: 'monument', name: 'Les monuments du centre', description: 'Premier tour des sites emblématiques, à pied.', emoji: '🏛️' },
      { time: 'Déjeuner', type: 'restaurant', name: 'Table du centre-ville', description: 'Une adresse simple pour reprendre des forces.', emoji: '🍽️' },
      { time: 'Après-midi', type: 'balade', name: 'Flânerie dans les vieilles rues', description: 'Le quartier historique, sans itinéraire précis.', emoji: '🚶' },
    ] },
  { time: 'Jour 2', type: 'musée', name: 'Immersion culturelle', description: 'Musées et galeries pour comprendre l\'histoire et l\'art local.', duration: 'Journée', emoji: '🖼️',
    moments: [
      { time: 'Matin', type: 'musée', name: 'Le musée principal', description: 'L\'histoire de la ville, pour comprendre le reste du séjour.', emoji: '🖼️' },
      { time: 'Déjeuner', type: 'cafe', name: 'Pause café', description: 'Un café le temps de digérer la visite.', emoji: '☕' },
      { time: 'Après-midi', type: 'activité', name: 'Galeries et ateliers', description: 'La scène artistique locale, plus confidentielle.', emoji: '🎨' },
    ] },
  { time: 'Jour 3', type: 'balade', name: 'Nature et grand air', description: 'Une journée au vert, parc ou site naturel autour de la ville.', duration: 'Journée', emoji: '🌳',
    moments: [
      { time: 'Matin', type: 'parc', name: 'Le grand parc', description: 'Une matinée au vert, loin du bruit.', emoji: '🌳' },
      { time: 'Déjeuner', type: 'restaurant', name: 'Déjeuner au vert', description: 'Une table avec terrasse près du parc.', emoji: '🥗' },
      { time: 'Après-midi', type: 'balade', name: 'Point de vue', description: 'La ville vue d\'en haut, en fin de journée.', emoji: '🌄' },
    ] },
  { time: 'Jour 4', type: 'activité', name: 'Marché et gastronomie locale', description: 'Marché local, spécialités culinaires et adresses de quartier.', duration: 'Journée', emoji: '🍴',
    moments: [
      { time: 'Matin', type: 'activité', name: 'Le marché', description: 'Produits locaux et ambiance du quartier.', emoji: '🧺' },
      { time: 'Déjeuner', type: 'restaurant', name: 'Spécialités locales', description: 'Le plat que l\'on ne mange que là.', emoji: '🍴' },
      { time: 'Après-midi', type: 'boulangerie', name: 'Douceurs de l\'après-midi', description: 'Une pâtisserie typique, en terrasse.', emoji: '🥐' },
    ] },
  { time: 'Jour 5', type: 'activité', name: 'Journée détente', description: 'Rythme plus calme : spa, café, ou simple flânerie selon l\'envie.', duration: 'Journée', emoji: '🧘',
    moments: [
      { time: 'Matin', type: 'cafe', name: 'Matinée sans programme', description: 'Un café, un livre, rien d\'autre.', emoji: '📖' },
      { time: 'Déjeuner', type: 'brunch', name: 'Brunch tardif', description: 'On se lève tard, on mange bien.', emoji: '🍳' },
      { time: 'Après-midi', type: 'activité', name: 'Détente', description: 'Spa, sieste ou flânerie, au choix.', emoji: '🧘' },
    ] },
  { time: 'Jour 6', type: 'tourisme', name: 'Excursion hors du centre', description: 'Une sortie plus loin pour changer de décor le temps d\'une journée.', duration: 'Journée', emoji: '🚗',
    moments: [
      { time: 'Matin', type: 'tourisme', name: 'Départ vers les environs', description: 'Une échappée hors de la ville.', emoji: '🚗' },
      { time: 'Déjeuner', type: 'restaurant', name: 'Table de village', description: 'Cuisine régionale, loin des circuits.', emoji: '🍲' },
      { time: 'Après-midi', type: 'balade', name: 'Retour par la côte', description: 'Le paysage sur le chemin du retour.', emoji: '🏞️' },
    ] },
  { time: 'Jour 7', type: 'shopping', name: 'Shopping et derniers souvenirs', description: 'Dernière journée pour ramener un souvenir avant le départ.', duration: 'Journée', emoji: '🛍️',
    moments: [
      { time: 'Matin', type: 'shopping', name: 'Derniers achats', description: 'Souvenirs et artisanat avant le départ.', emoji: '🛍️' },
      { time: 'Déjeuner', type: 'cafe', name: 'Dernier café', description: 'Le café d\'adieu, à la terrasse préférée.', emoji: '☕' },
      { time: 'Après-midi', type: 'monument', name: 'Un dernier regard', description: 'Repasser par l\'endroit qui a marqué le séjour.', emoji: '📸' },
    ] },
];

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);
  private readonly ai: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly places: PlacesService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const ai = config.get<AppConfig['ai']>('ai');
    // On ne construit le client que si une clé est réellement configurée :
    // `new Anthropic()` sans clé lève à la construction (crash au bootstrap).
    // Sans clé → `this.ai = null` → repli déterministe garanti.
    this.ai = ai?.provider === 'anthropic' && ai.anthropicApiKey
      ? new Anthropic({ apiKey: ai.anthropicApiKey })
      : null;
    this.model = ai?.modelSmart ?? CLAUDE_MODEL;
  }

  async generate(
    userId: string,
    req: ItineraryRequest,
  ): Promise<{ itinerary: string; steps: ItineraryStep[]; error?: string }> {
    const moodCtx = MOOD_CONTEXT[req.mood] ?? '';
    const city = req.city.trim() || 'Paris';

    const isWeek = req.duration === 'semaine';

    // Lieux de la ville, par univers.
    //
    // Deux précautions absentes de la version d'origine, qui interrogeait la
    // base une fois par étape et retenait toujours le premier résultat :
    //
    //  - un CACHE par univers. Une semaine découpée en moments demande une
    //    trentaine de résolutions ; sans cache, autant de requêtes quasi
    //    identiques.
    //  - un CURSEUR par univers. Sans lui, les sept dîners d'une semaine
    //    pointeraient tous le même restaurant — défaut déjà présent avant les
    //    moments, mais qui passait inaperçu sur cinq étapes.
    const byUniverse = new Map<Universe, PlaceCandidate[]>();
    const used = new Map<Universe, number>();

    const candidatesFor = async (universe: Universe): Promise<PlaceCandidate[]> => {
      const cached = byUniverse.get(universe);
      if (cached) return cached;
      let found: PlaceCandidate[] = [];
      try {
        found = await this.places.searchByCity({ city, universe, limit: 20 });
      } catch {
        // Base indisponible : l'étape reste sans lieu, le texte suffit.
      }
      // Les lieux avec photo d'abord — une carte sans image est terne.
      const ranked = [...found].sort(
        (a, b) => Number(b.photoUrls.length > 0) - Number(a.photoUrls.length > 0),
      );
      byUniverse.set(universe, ranked);
      return ranked;
    };

    // Les vrais lieux de la ville, montrés au modèle avant qu'il écrive :
    // il choisit dedans au lieu d'inventer (voir MOOD_UNIVERSES). Les mêmes
    // listes servent ensuite au rattachement, sans nouvelle requête.
    let known = '';
    if (this.ai) {
      const offered = MOOD_UNIVERSES[req.mood] ?? DEFAULT_UNIVERSES;
      const lists = await Promise.all(
        offered.map(async (universe) => ({
          universe,
          places: (await candidatesFor(universe))
            .filter(isFitForItinerary)
            .slice(0, KNOWN_PLACES_PER_UNIVERSE),
        })),
      );
      known = knownPlacesBlock(city, lists);
    }

    const prompt = `${moodCtx}

Génère un itinéraire ${req.duration} à ${city} pour ${req.mood}${req.groupSize ? ` (${req.groupSize} personnes)` : ''}.
Budget : ${req.budget}.
${req.interests?.length ? `Centres d'intérêt : ${req.interests.join(', ')}.` : ''}
${req.startTime ? `Heure de départ : ${req.startTime}.` : ''}
${req.constraints ? `Contraintes importantes : ${req.constraints}.` : ''}
${known ? `\n${known}\n` : ''}
Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks, sans commentaires) :
{
  "summary": "Description courte et enthousiaste de l'itinéraire (1-2 phrases, donne envie)",
  "steps": [
    {
      "time": "19h00",
      "type": "restaurant",
      "name": "Titre de l'étape",
      "place": "Nom EXACT du lieu, ou \\"\\" si l'étape n'est pas un lieu précis",
      "description": "Ce qu'on y fait, pourquoi c'est parfait pour ce mood",
      "duration": "1h30",
      "emoji": "🍽️",
      "tips": "Conseil pratique"
    }
  ]
}

Types valides : restaurant, cafe, bar, musée, parc, shopping, cinema, nightclub, monument, glace, boulangerie, balade, activité, photo, brunch, cocktail, dessert.
${isWeek
  ? ''
  : 'Génère 4-6 étapes bien enchaînées et réalistes.'}`;

    let steps: ItineraryStep[] = [];
    let summary = '';

    // Tentative IA — seulement si un client est configuré (clé présente).
    // Toute panne (pas de crédit, quota, timeout, JSON invalide…) bascule sur
    // le repli déterministe : la fonctionnalité reste utilisable en permanence.
    if (this.ai) {
      try {
        if (isWeek) {
          const week = await this.generateWeek(req, city, known);
          summary = week.summary;
          steps = week.steps;
        } else {
          const parsed = await this.askJson<{ summary: string; steps: ItineraryStep[] }>(prompt, 1500);
          summary = parsed.summary ?? '';
          steps = parsed.steps ?? [];
        }
      } catch (err) {
        this.logger.warn(`[itinerary] IA indisponible, repli déterministe : ${String(err)}`);
      }
    }

    // `place` vient du modèle : n'en garder qu'une chaîne, sans quoi un `null`
    // passerait pour « pas de lieu précis » ou pour un nom.
    const cleanPlace = (target: { place?: unknown }): void => {
      if (typeof target.place === 'string') target.place = withoutAddress(target.place.trim());
      else delete target.place;
    };
    for (const step of steps) {
      cleanPlace(step);
      for (const moment of step.moments ?? []) cleanPlace(moment);
    }

    // Repli : aucune étape IA (pas de clé, plus de crédit, erreur…) → trame
    // pré-définie adaptée au mood, tronquée selon la durée demandée.
    if (steps.length === 0) {
      const sequence = isWeek ? WEEK_FALLBACK : (FALLBACK_SEQUENCES[req.mood] ?? FALLBACK_SEQUENCES.amis);
      // Copie EN PROFONDEUR : `{ ...s }` laissait le tableau `moments`
      // partagé avec la constante globale. La résolution écrivant ses
      // `placeId` et ses photos dans ces objets, la trame se polluait au
      // premier repli — et la génération suivante, dans une autre ville,
      // héritait des lieux de la précédente sans jamais les rechercher.
      steps = sequence.slice(0, stepCountForDuration(req.duration)).map((s) => ({
        ...s,
        moments: s.moments?.map((m) => ({ ...m })),
      }));
      if (!summary) {
        // « de la ville », pas « près de toi » : en mode Voyage, la ville
        // demandée peut être à des milliers de kilomètres de l'utilisateur.
        summary = `Un itinéraire ${req.duration} à ${city} pensé pour un moment ${req.mood}. Chaque étape est un vrai lieu de la ville.`;
      }
    }

    // Enrichissement : rattacher un vrai lieu de la base à chaque étape ET à
    // chaque moment de journée (cache et curseur par univers : plus haut).

    /** Le lieu de la base qui porte EXACTEMENT ce nom, tous univers confondus. */
    const byExactName = (place: string): PlaceCandidate | undefined => {
      const key = flatName(place);
      if (!key) return undefined;
      for (const list of byUniverse.values()) {
        const hit = list.find((p) => flatName(p.name) === key);
        if (hit) return hit;
      }
      return undefined;
    };

    const toResolved = (place: PlaceCandidate): ResolvedPlace => ({
      placeId: place.id,
      placeRating: place.rating,
      placePhoto: place.photoUrls[0] ?? undefined,
      placeLat: place.lat,
      placeLng: place.lng,
      placeName: place.name,
    });

    /**
     * Rattache un vrai lieu à une étape ou à un moment.
     *
     * `requireNameMatch` distingue deux intentions de l'IA :
     *  - un MOMENT nomme un endroit précis. Faute de correspondance, on
     *    n'attache RIEN : une carte « Cascade El Limón » illustrée par un bar
     *    quelconque est pire qu'une carte sans photo, le texte suffit.
     *  - une ÉTAPE nomme souvent un genre (« Un dîner romantique »). Là, un
     *    lieu du bon univers est exactement ce qui est attendu.
     */
    const resolvePlace = async (
      title: string,
      type: string,
      allowSubstitute: boolean,
      place?: string,
    ): Promise<ResolvedPlace & { adoptName?: string }> => {
      // Le modèle a dit que l'étape n'est pas un lieu précis : lui en
      // attacher un serait mentir sur la photo.
      if (place === '') return {};
      // Un lieu de la liste, recopié tel quel : c'est le cas visé. Le titre
      // de l'étape (« Petit-déjeuner au … ») reste celui du modèle.
      if (place) {
        const exact = byExactName(place);
        if (exact) return toResolved(exact);
      }
      // Sinon on cherche par le nom du lieu s'il est donné, par le titre
      // pour la trame de repli et les réponses sans champ `place`.
      const name = place || title;

      const universe = stepTypeToUniverse(type);
      if (!universe) return {};
      const candidates = await candidatesFor(universe);
      if (candidates.length === 0) return {};

      // Un intitulé générique d'ÉTAPE (« Une spécialité locale ») ne désigne
      // aucun endroit : on ne le rapproche donc pas d'un lieu par son nom. Le
      // faire accrochait l'étape au premier établissement partageant un mot —
      // « Jenny's Bubble – spécialité Bubble Waffle » pour « Une spécialité
      // locale » — et, le lieu étant « trouvé par son nom », le titre
      // générique restait affiché sur la photo d'un commerce précis
      // (24/11/2026). Ces étapes-là passent par le choix par défaut plus bas,
      // qui adopte le nom du lieu.
      const generic = isGenericName(name);
      const byName = generic && allowSubstitute
        ? undefined
        : candidates.find((p) => namesMatch(name, p.name, city));
      // Un lieu trouvé par son nom n'avance pas le curseur : il est légitime
      // qu'il revienne plusieurs fois si l'itinéraire y repasse vraiment.
      if (byName) return toResolved(byName);

      // Faute de correspondance, on ne comble que les intitulés génériques —
      // et on adopte alors le NOM du lieu retenu. C'est ce qui empêche la
      // carte de se contredire : titre, photo, note et lien désignent tous le
      // même endroit. Un nom propre non trouvé, lui, ne reçoit rien : l'écran
      // le résoudra à la demande, au clic.
      if (!allowSubstitute || !generic) return {};

      // Le choix par défaut écarte ce qu'on ne propose jamais de soi-même
      // (cimetière, station-service… voir UNFIT_TAGS).
      const fit = candidates.filter(isFitForItinerary);
      if (fit.length === 0) return {};
      const index = used.get(universe) ?? 0;
      used.set(universe, index + 1);
      const pick = fit[index % fit.length];
      return { ...toResolved(pick), adoptName: pick.name };
    };

    /**
     * Dernier recours pour un NOM PROPRE absent de notre base : on le demande
     * au fournisseur de lieux, qui le retrouve et l'importe — avec sa photo.
     *
     * C'est ce qui rend les cartes illustrées à nouveau sans rouvrir la porte
     * aux photos mensongères : l'image vient de l'endroit NOMMÉ, pas d'un
     * voisin du même genre.
     *
     * Chaque appel est facturé, d'où un BUDGET : les étapes visibles d'emblée
     * y ont droit, pas les vingt moments d'une semaine que l'utilisateur
     * n'ouvrira pas. Ce qui est trouvé est persisté, donc une ville
     * consultée souvent cesse vite de coûter.
     */
    // 16 : les 4 à 6 étapes d'une sortie, ou deux essais par journée d'une
    // semaine pour lui trouver une image.
    let importBudget = 16;
    const resolveByProvider = async (
      name: string,
      type: string,
    ): Promise<ResolvedPlace & { adoptName?: string }> => {
      if (importBudget <= 0) return {};
      const universe = stepTypeToUniverse(type);
      importBudget -= 1;
      const found = await this.places
        // Les cinq réponses du fournisseur sont comparées, pas seulement la
        // première : le bon lieu arrive parfois deuxième.
        .findOrImportByName({
          name,
          city,
          universe: universe ?? undefined,
          prefer: (p) => namesMatch(name, p.name, city),
        })
        .catch(() => null);
      if (!found) return {};

      // Une recherche textuelle rend TOUJOURS quelque chose : pour un nom
      // inventé par le modèle, elle rendra l'établissement le plus proche du
      // texte, pas l'endroit demandé. On revérifie donc le nom — sans ce
      // contrôle, on aurait juste déplacé la photo mensongère d'un cran.
      if (namesMatch(name, found.name, city)) return toResolved(found);

      // Un intitulé générique (« Un bar à cocktails ») ne désigne aucun
      // endroit : le fournisseur en propose un vrai, et on adopte son NOM avec
      // sa photo — la même règle que pour une substitution depuis la base.
      // Sans ça, une ville encore absente de la base laissait toutes ces
      // cartes sans image.
      if (isGenericName(name)) {
        return isFitForItinerary(found) ? { ...toResolved(found), adoptName: found.name } : {};
      }

      this.logger.debug(`« ${name} » : le fournisseur a répondu « ${found.name} », écarté.`);
      return {};
    };

    // ── 1. Préchargement des univers, en parallèle ──────────────────────
    //
    // `candidatesFor` met en cache par univers, mais la première demande de
    // chaque univers partait au milieu de la boucle : autant d'attentes
    // réseau sérialisées. On les lance toutes d'un coup ici — le cache est
    // alors déjà chaud quand la boucle commence, et son intérêt intact.
    const universes = new Set<Universe>();
    for (const step of steps) {
      const isDay = (step.moments?.length ?? 0) > 0;
      if (!isDay) {
        const u = stepTypeToUniverse(step.type);
        if (u) universes.add(u);
      }
      for (const moment of step.moments ?? []) {
        const u = stepTypeToUniverse(moment.type);
        if (u) universes.add(u);
      }
    }
    await Promise.all([...universes].map((u) => candidatesFor(u)));

    // ── 2. Rattachement depuis la base ──────────────────────────────────
    //
    // Toujours séquentiel : le curseur par univers doit avancer de façon
    // déterministe, sans quoi les sept dîners d'une semaine pointeraient le
    // même restaurant. Mais plus aucune attente réseau ici — tout est en
    // mémoire depuis la phase 1.
    //
    // Une journée de séjour (mode semaine) n'est pas un lieu : « Marché et
    // gastronomie locale » ne se remplace par aucun restaurant. On ne lui
    // attache donc rien directement — ses moments, eux, nomment de vrais
    // endroits.
    for (const step of steps) {
      const isDay = (step.moments?.length ?? 0) > 0;

      if (!isDay) {
        const { adoptName, ...resolved } = await resolvePlace(step.name, step.type, true, step.place);
        Object.assign(step, resolved);
        if (adoptName) step.name = adoptName;
      }

      for (const moment of step.moments ?? []) {
        const { adoptName, ...resolved } = await resolvePlace(moment.name, moment.type, false, moment.place);
        Object.assign(moment, resolved);
        if (adoptName) moment.name = adoptName;
      }
    }

    // ── 3. Fournisseur de lieux, en parallèle ───────────────────────────
    //
    // Ce qui reste sans lieu après la base part chez le fournisseur. Ces
    // appels-là sont indépendants les uns des autres — un nom propre ne
    // partage ni cache ni curseur — donc rien n'impose de les enchaîner.
    // En file, une semaine y passait jusqu'à quatorze allers-retours.
    //
    // Le budget (cf. `resolveByProvider`) reste consommé dans le même ordre
    // qu'avant : étapes d'abord, puis premier essai de chaque journée, puis
    // second. Seul l'ordre entre essais d'une même journée et d'une autre
    // change, ce qui ne se voit ni au résultat ni à la facture.
    const applyProvider = async (
      target: ItineraryStep | ItineraryMoment,
    ): Promise<void> => {
      // « Pas un lieu précis » : rien à demander, ni à payer.
      if (target.place === '') return;
      const { adoptName, ...fromProvider } = await resolveByProvider(target.place || target.name, target.type);
      Object.assign(target, fromProvider);
      if (adoptName) target.name = adoptName;
    };

    // Étapes simples : chacune veut son propre lieu, aucune ne dépend d'une
    // autre.
    await Promise.all(
      steps
        .filter((step) => (step.moments?.length ?? 0) === 0 && !step.placeId)
        .map(applyProvider),
    );

    // Journées : il suffit d'UNE photo pour illustrer la journée. On tente
    // donc un premier moment par journée, puis un second seulement pour
    // celles encore sans image — deux tours parallèles au lieu de deux
    // appels en file par journée, pour le même nombre d'appels facturés.
    const days = steps.filter((step) => (step.moments?.length ?? 0) > 0);
    const needsPhoto = (day: ItineraryStep): boolean =>
      !day.moments?.some((m) => m.placePhoto);

    // Instantané pris AVANT les tours : `applyProvider` renseigne `placeId`
    // sur le moment qu'il résout, donc un filtre recalculé au second tour
    // sauterait le moment suivant au lieu de l'essayer.
    const candidates = new Map<ItineraryStep, ItineraryMoment[]>(
      days.map((day) => [day, (day.moments ?? []).filter((m) => !m.placeId && m.place !== '')]),
    );

    for (const round of [0, 1]) {
      const targets = days
        .filter(needsPhoto)
        .map((day) => candidates.get(day)?.[round])
        .filter((m): m is ItineraryMoment => m !== undefined);
      if (targets.length === 0) break;
      await Promise.all(targets.map(applyProvider));
    }

    // La photo de la journée vient de son premier moment illustré : elle
    // montre un endroit où l'on va vraiment ce jour-là. Aucun `placeId`
    // n'est copié — la vignette illustre, elle ne prétend pas que la
    // journée entière soit ce lieu. Les moments non résolus le seront au
    // clic, pour ne payer que ce que l'utilisateur consulte.
    for (const day of days) {
      if (!day.placePhoto) {
        day.placePhoto = day.moments?.find((m) => m.placePhoto)?.placePhoto;
      }
    }

    // `place` ne sert qu'au rattachement : l'app ne le connaît pas. Elle
    // apprend seulement qu'une étape n'est pas un lieu.
    const finish = (target: ItineraryStep | ItineraryMoment): void => {
      if (target.place === '' && !target.placeId) target.noPlace = true;
      delete target.place;
    };
    for (const step of steps) {
      finish(step);
      for (const moment of step.moments ?? []) finish(moment);
    }

    return { itinerary: summary, steps };
  }

  /**
   * Un appel au modèle, dont on attend un objet JSON.
   *
   * Claude enveloppe parfois sa réponse dans des backticks markdown malgré la
   * consigne : on extrait donc le premier objet plutôt que de parser le texte
   * brut.
   */
  private async askJson<T>(prompt: string, maxTokens: number): Promise<T> {
    // Plafond élargi : réflexion de Haiku 5.5 + ~30 % de jetons en plus.
    const budget = withHeadroom(maxTokens, ITINERARY_EFFORT);
    const response = await this.ai!.messages.create({
      model: this.model,
      max_tokens: budget,
      messages: [{ role: 'user', content: prompt }],
      ...claudeTuning(ITINERARY_EFFORT),
    } as Anthropic.Messages.MessageCreateParamsNonStreaming);

    // Une réponse coupée par la limite de jetons produit un JSON tronqué,
    // donc invalide. Sans ce contrôle, l'erreur remontait sous la forme
    // « Expected ',' or ']' » — un message de parsing pour un problème de
    // budget, qui envoie chercher au mauvais endroit. Un refus de sécurité
    // est signalé de la même façon, explicitement.
    assertUsable(response, budget);

    // Blocs `text` seulement : une réponse Haiku 5.5 peut commencer par un
    // bloc de réflexion.
    const raw = responseText(response);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    return JSON.parse(jsonMatch[0]) as T;
  }

  /**
   * Itinéraire d'une semaine, en DEUX TEMPS.
   *
   * Écrire les sept jours d'un seul bloc demandait au modèle de produire
   * plusieurs milliers de jetons avant le premier caractère affichable :
   * 103 secondes mesurées en production, dont 95 pour ce seul appel — le temps
   * de réponse est proportionnel au texte produit.
   *
   * On sépare donc :
   *  1. un appel court qui fixe les sept thèmes (quelques centaines de jetons) ;
   *  2. sept appels courts, lancés EN PARALLÈLE, qui détaillent chacun un jour.
   *
   * La durée devient celle du plus lent des sept, plus le premier appel — au
   * lieu de leur somme. Le premier appel garde son intérêt : sans lui, sept
   * générations indépendantes proposeraient trois fois le même musée.
   */
  private async generateWeek(
    req: ItineraryRequest,
    city: string,
    known = '',
  ): Promise<{ summary: string; steps: ItineraryStep[] }> {
    const moodCtx = MOOD_CONTEXT[req.mood] ?? MOOD_CONTEXT.amis;

    const outline = await this.askJson<{
      summary?: string;
      days?: Array<{ time?: string; type?: string; name?: string; emoji?: string }>;
    }>(
      `${moodCtx}

Séjour d'une semaine à ${city}. Budget : ${req.budget}.${req.interests?.length ? ` Centres d'intérêt : ${req.interests.join(', ')}.` : ''}${req.constraints ? ` Contraintes : ${req.constraints}.` : ''}

Donne le PLAN de la semaine, sans détailler. Réponds UNIQUEMENT avec un objet JSON valide :
{
  "summary": "Description courte et enthousiaste du séjour (1-2 phrases)",
  "days": [
    { "time": "Jour 1", "type": "monument", "name": "Titre de la journée", "emoji": "🏛️" }
  ]
}

EXACTEMENT 7 jours. Chaque jour a une thématique DIFFÉRENTE, pensée pour un séjour complet et varié.
Types valides : restaurant, cafe, bar, musée, parc, shopping, cinema, nightclub, monument, glace, boulangerie, balade, activité, photo, brunch, cocktail, dessert.`,
      900,
    );

    const days = (outline.days ?? []).slice(0, 7);
    if (days.length === 0) throw new Error('Plan de semaine vide');

    const themes = days.map((d) => d.name ?? '').filter(Boolean).join(' · ');

    const steps = await Promise.all(
      days.map(async (day, i): Promise<ItineraryStep> => {
        const base: ItineraryStep = {
          time: day.time ?? `Jour ${i + 1}`,
          type: day.type ?? 'activité',
          name: day.name ?? `Jour ${i + 1}`,
          description: '',
          duration: 'Journée',
          emoji: day.emoji ?? '📍',
        };

        try {
          const detail = await this.askJson<{
            description?: string;
            tips?: string;
            moments?: ItineraryMoment[];
          }>(
            `${moodCtx}

Séjour d'une semaine à ${city}, budget ${req.budget}. Programme complet : ${themes}.

Détaille UNIQUEMENT cette journée : « ${base.name} » (${base.time}).
${known ? `\n${known}\n` : ''}
Réponds UNIQUEMENT avec un objet JSON valide :
{
  "description": "Ce qu'on fait ce jour-là, 2-3 phrases concrètes et donnant envie",
  "tips": "Un conseil pratique (transport, horaire, tarif)",
  "moments": [
    { "time": "Matin", "type": "monument", "name": "Nom PRÉCIS du lieu", "place": "Nom EXACT du lieu, ou \\"\\"", "description": "Ce qu'on y fait", "emoji": "🏰", "tips": "Conseil" },
    { "time": "Après-midi", "type": "restaurant", "name": "...", "place": "...", "description": "...", "emoji": "🍽️", "tips": "..." },
    { "time": "Soir", "type": "bar", "name": "...", "place": "...", "description": "...", "emoji": "🍷", "tips": "..." }
  ]
}

EXACTEMENT 3 moments, dans l'ordre de la journée, cohérents avec la description.
Sois CONCIS : 2 phrases maximum pour "description", 1 phrase pour chaque "description" de moment, 1 phrase pour chaque "tips".
Donne le nom RÉEL et précis de chaque endroit — c'est lui qui permet de retrouver le lieu.
Ne reprends aucune activité des autres journées du programme.
Types valides : restaurant, cafe, bar, musée, parc, shopping, cinema, nightclub, monument, glace, boulangerie, balade, activité, photo, brunch, cocktail, dessert.`,
            // Mesuré : la version précédente coupait à 900 jetons, en plein
            // tableau de moments. Le plafond doit couvrir le pire cas, et la
            // consigne de concision ci-dessus maintient le cas courant bien
            // en dessous — ce qui compte, puisque le temps de réponse suit le
            // texte réellement produit, pas le plafond.
            1400,
          );

          return {
            ...base,
            description: detail.description ?? '',
            tips: detail.tips,
            moments: detail.moments,
          };
        } catch (err) {
          // Une journée qui échoue ne doit pas emporter la semaine : elle garde
          // son titre et son emoji, simplement sans détail.
          this.logger.warn(`[itinerary] détail du ${base.time} indisponible : ${String(err)}`);
          return { ...base, description: `Une journée consacrée à ${base.name.toLowerCase()}.` };
        }
      }),
    );

    return { summary: outline.summary ?? '', steps };
  }

  /** Sauvegarde un itinéraire déjà généré tel quel (pas de régénération à la relecture). */
  async save(userId: string, dto: {
    mood: string; duration: string; budget: string; city: string; summary: string; steps: ItineraryStep[];
  }) {
    return this.prisma.savedItinerary.create({
      data: {
        userId,
        mood: dto.mood,
        duration: dto.duration,
        budget: dto.budget,
        city: dto.city,
        summary: dto.summary,
        steps: dto.steps as never,
      },
    });
  }

  async listSaved(userId: string) {
    return this.prisma.savedItinerary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSaved(userId: string, id: string) {
    const item = await this.prisma.savedItinerary.findUnique({ where: { id } });
    if (!item || item.userId !== userId) throw new NotFoundException('Itinéraire introuvable');
    await this.prisma.savedItinerary.delete({ where: { id } });
  }
}
