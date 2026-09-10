import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Universe } from '@yumia/shared';
import type { AppConfig } from '../../config/configuration';
import { PlacesService } from '../places/places.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

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

/** Un lieu tel que renvoyé par PlacesService — dérivé pour ne pas diverger. */
type PlaceCandidate = Awaited<ReturnType<PlacesService['searchByCity']>>[number];

/** Lieu réel de la base, rattaché à une étape ou à un moment. */
interface ResolvedPlace {
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
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
}

export interface ItineraryStep extends ResolvedPlace {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
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
    this.model = ai?.modelSmart ?? 'claude-sonnet-4-6';
  }

  async generate(
    userId: string,
    req: ItineraryRequest,
  ): Promise<{ itinerary: string; steps: ItineraryStep[]; error?: string }> {
    const moodCtx = MOOD_CONTEXT[req.mood] ?? '';
    const city = req.city.trim() || 'Paris';

    const isWeek = req.duration === 'semaine';

    const prompt = `${moodCtx}

Génère un itinéraire ${req.duration} à ${city} pour ${req.mood}${req.groupSize ? ` (${req.groupSize} personnes)` : ''}.
Budget : ${req.budget}.
${req.interests?.length ? `Centres d'intérêt : ${req.interests.join(', ')}.` : ''}
${req.startTime ? `Heure de départ : ${req.startTime}.` : ''}
${req.constraints ? `Contraintes importantes : ${req.constraints}.` : ''}

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans backticks, sans commentaires) :
{
  "summary": "Description courte et enthousiaste de l'itinéraire (1-2 phrases, donne envie)",
  "steps": [
    {
      "time": "19h00",
      "type": "restaurant",
      "name": "Nom du lieu ou type de lieu",
      "description": "Ce qu'on y fait, pourquoi c'est parfait pour ce mood",
      "duration": "1h30",
      "emoji": "🍽️",
      "tips": "Conseil pratique"
    }
  ]
}

Types valides : restaurant, cafe, bar, musée, parc, shopping, cinema, nightclub, monument, glace, boulangerie, balade, activité, photo, brunch, cocktail, dessert.
${isWeek
  ? `Durée demandée : une semaine complète. Génère EXACTEMENT 7 étapes, une par jour (pas d'horaire précis) : "time" doit valoir "Jour 1", "Jour 2", ... "Jour 7", et "duration" doit valoir "Journée". Chaque jour propose UNE thématique/activité principale différente (pas de répétition d'un jour à l'autre), pensée pour un séjour touristique complet et varié dans la ville.

En mode semaine, chaque étape porte EN PLUS un tableau "moments" de 3 à 4 entrées qui découpe la journée. C'est ce découpage que l'utilisateur ouvrira pour dérouler sa journée :
      "moments": [
        { "time": "Matin", "type": "monument", "name": "Nom précis du lieu", "description": "Ce qu'on y fait concrètement", "emoji": "🏰", "tips": "Conseil pratique" },
        { "time": "Déjeuner", "type": "restaurant", "name": "...", "description": "...", "emoji": "🍽️" },
        { "time": "Après-midi", "type": "balade", "name": "...", "description": "...", "emoji": "🚶" },
        { "time": "Soir", "type": "bar", "name": "...", "description": "...", "emoji": "🍷" }
      ]
Les moments doivent être COHÉRENTS avec la description de la journée : si elle évoque un château puis un quartier puis des tapas, les moments reprennent ces trois endroits, dans l'ordre. Chaque "type" doit appartenir à la liste des types valides.`
  : 'Génère 4-6 étapes bien enchaînées et réalistes.'}`;

    let steps: ItineraryStep[] = [];
    let summary = '';

    // Tentative IA — seulement si un client est configuré (clé présente).
    // Toute panne (pas de crédit, quota, timeout, JSON invalide…) bascule sur
    // le repli déterministe : la fonctionnalité reste utilisable en permanence.
    if (this.ai) {
      try {
        const response = await this.ai.messages.create({
          model: this.model,
          max_tokens: isWeek ? 6000 : 1500,
          messages: [{ role: 'user', content: prompt }],
        });

        const raw = response.content[0].type === 'text' ? response.content[0].text : '';

        // Extrait le JSON même si Claude l'a enveloppé dans des backticks markdown
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response');

        const parsed = JSON.parse(jsonMatch[0]) as { summary: string; steps: ItineraryStep[] };
        summary = parsed.summary ?? '';
        steps = parsed.steps ?? [];
      } catch (err) {
        this.logger.warn(`[itinerary] IA indisponible, repli déterministe : ${String(err)}`);
      }
    }

    // Repli : aucune étape IA (pas de clé, plus de crédit, erreur…) → trame
    // pré-définie adaptée au mood, tronquée selon la durée demandée.
    if (steps.length === 0) {
      const sequence = isWeek ? WEEK_FALLBACK : (FALLBACK_SEQUENCES[req.mood] ?? FALLBACK_SEQUENCES.amis);
      steps = sequence.slice(0, stepCountForDuration(req.duration)).map((s) => ({ ...s }));
      if (!summary) {
        summary = `Un itinéraire ${req.duration} à ${city} pensé pour un moment ${req.mood}. Chaque étape est un vrai lieu près de toi.`;
      }
    }

    // Enrichissement : rattacher un vrai lieu de la base à chaque étape ET à
    // chaque moment de journée.
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

    const resolvePlace = async (type: string): Promise<ResolvedPlace> => {
      const universe = stepTypeToUniverse(type);
      if (!universe) return {};
      const candidates = await candidatesFor(universe);
      if (candidates.length === 0) return {};
      const index = used.get(universe) ?? 0;
      used.set(universe, index + 1);
      const place = candidates[index % candidates.length];
      return {
        placeId: place.id,
        placeRating: place.rating,
        placePhoto: place.photoUrls[0] ?? undefined,
        placeLat: place.lat,
        placeLng: place.lng,
      };
    };

    // Séquentiel, et non `Promise.all` : le curseur doit avancer de façon
    // déterministe, et paralléliser viderait le cache de son intérêt puisque
    // toutes les requêtes partiraient avant la première réponse.
    for (const step of steps) {
      Object.assign(step, await resolvePlace(step.type));
      for (const moment of step.moments ?? []) {
        Object.assign(moment, await resolvePlace(moment.type));
      }
    }

    return { itinerary: summary, steps };
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
