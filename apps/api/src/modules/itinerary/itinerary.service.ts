import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Universe } from '@yumia/shared';
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

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);
  private readonly ai = new Anthropic();

  constructor(private readonly places: PlacesService) {}

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

    try {
      const response = await this.ai.messages.create({
        model: 'claude-sonnet-4-6',
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
      this.logger.error(`[itinerary] generation error: ${String(err)}`);
      return {
        itinerary: '',
        steps: [],
        error: 'Impossible de générer l\'itinéraire. Réessaie dans quelques instants.',
      };
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
