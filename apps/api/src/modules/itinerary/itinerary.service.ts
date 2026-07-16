import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Universe } from '@yumia/shared';
import type { AppConfig } from '../../config/configuration';
import { PlacesService } from '../places/places.service';

export interface ItineraryRequest {
  mood: string;           // 'date' | 'amis' | 'famille' | 'solo' | 'touriste'
  duration: string;       // 'soirée' | 'journée' | 'demi-journée' | 'weekend'
  budget: string;         // 'économique' | 'moyen' | 'premium'
  city: string;
  interests?: string[];
  groupSize?: number;
  startTime?: string;
  constraints?: string;
}

export interface ItineraryStep {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
  // Lieu réel depuis la DB (si trouvé)
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
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
    default: return 4;
  }
}

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);
  private readonly ai: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly places: PlacesService,
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
Génère 4-6 étapes bien enchaînées et réalistes.`;

    let steps: ItineraryStep[] = [];
    let summary = '';

    // Tentative IA — seulement si un client est configuré (clé présente).
    // Toute panne (pas de crédit, quota, timeout, JSON invalide…) bascule sur
    // le repli déterministe : la fonctionnalité reste utilisable en permanence.
    if (this.ai) {
      try {
        const response = await this.ai.messages.create({
          model: this.model,
          max_tokens: 1500,
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
      const sequence = FALLBACK_SEQUENCES[req.mood] ?? FALLBACK_SEQUENCES.amis;
      steps = sequence.slice(0, stepCountForDuration(req.duration)).map((s) => ({ ...s }));
      if (!summary) {
        summary = `Un itinéraire ${req.duration} à ${city} pensé pour un moment ${req.mood}. Chaque étape est un vrai lieu près de toi.`;
      }
    }

    // Enrichissement : tenter de lier chaque étape à un vrai lieu de la DB
    steps = await Promise.all(
      steps.map(async (step) => {
        const universe = stepTypeToUniverse(step.type);
        if (!universe) return step;
        try {
          const found = await this.places.searchByCity({ city, universe, limit: 5 });
          if (found.length === 0) return step;
          // Préférer les lieux avec photo et bien notés
          const withPhoto = found.filter((p) => p.photoUrls.length > 0);
          const best = withPhoto.length > 0 ? withPhoto[0] : found[0];
          return {
            ...step,
            placeId: best.id,
            placeRating: best.rating,
            placePhoto: best.photoUrls[0] ?? undefined,
            placeLat: best.lat,
            placeLng: best.lng,
          };
        } catch {
          return step;
        }
      }),
    );

    return { itinerary: summary, steps };
  }
}
