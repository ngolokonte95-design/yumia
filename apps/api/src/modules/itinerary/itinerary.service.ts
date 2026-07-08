import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ItineraryRequest {
  mood: string;           // 'date' | 'amis' | 'famille' | 'solo' | 'touriste'
  duration: string;       // 'soirée' | 'journée' | 'demi-journée' | 'weekend'
  budget: string;         // 'économique' | 'moyen' | 'premium'
  city: string;
  interests?: string[];   // univers préférés
  groupSize?: number;
  startTime?: string;     // ex: "19h00"
  constraints?: string;   // ex: "végétarien, pas d'alcool"
}

@Injectable()
export class ItineraryService {
  private readonly logger = new Logger(ItineraryService.name);
  private readonly ai = new Anthropic();

  async generate(userId: string, req: ItineraryRequest): Promise<{ itinerary: string; steps: ItineraryStep[] }> {
    const prompt = `Crée un itinéraire ${req.duration} à ${req.city} pour ${req.mood}${req.groupSize ? ` (${req.groupSize} personnes)` : ''}.
Budget : ${req.budget}.
${req.interests?.length ? `Centres d'intérêt : ${req.interests.join(', ')}.` : ''}
${req.startTime ? `Heure de départ : ${req.startTime}.` : ''}
${req.constraints ? `Contraintes : ${req.constraints}.` : ''}

Réponds UNIQUEMENT avec un JSON valide de ce format exact (sans markdown, sans backticks) :
{
  "summary": "Description courte et enthousiaste de l'itinéraire (1-2 phrases)",
  "steps": [
    {
      "time": "19h00",
      "type": "restaurant",
      "name": "Nom du lieu ou type de lieu",
      "description": "Ce qu'on y fait, pourquoi c'est parfait",
      "duration": "1h30",
      "emoji": "🍽️",
      "tips": "Conseil pratique optionnel"
    }
  ]
}
Génère 4-6 étapes réalistes et bien enchaînées.`;

    try {
      const response = await this.ai.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
      const parsed = JSON.parse(raw) as { summary: string; steps: ItineraryStep[] };
      return { itinerary: parsed.summary, steps: parsed.steps };
    } catch (err) {
      this.logger.error(`[itinerary] parse error: ${String(err)}`);
      return {
        itinerary: `Une ${req.duration} parfaite à ${req.city} t'attend !`,
        steps: [],
      };
    }
  }
}

export interface ItineraryStep {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
}
