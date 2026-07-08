import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedMenuItem {
  name: string;
  description?: string;
  price?: number;
  currency: string;
  category?: string;
  tags: string[];
}

const EXTRACTION_PROMPT = (language: string) => `
Tu es un assistant spécialisé dans l'extraction de menus de restaurants à partir de photos.

Analyse cette photo de menu et extrais TOUS les plats/boissons visibles.
Retourne un JSON valide (tableau d'objets) avec cette structure exacte :
[
  {
    "name": "Nom du plat",
    "description": "Description si visible (sinon null)",
    "price": 12.50,
    "currency": "${language === 'fr' ? 'EUR' : 'USD'}",
    "category": "entrée|plat|dessert|boisson|snack|autre",
    "tags": ["végétarien","halal","sans_gluten"] // tags pertinents uniquement, tableau vide si aucun
  }
]

RÈGLES :
- Si le prix n'est pas visible, mettre null (pas 0)
- Normalise les noms (première lettre majuscule)
- Déduis la catégorie logiquement si pas indiquée
- Tags possibles : végétarien, vegan, halal, kasher, sans_gluten, sans_lactose, épicé, signature
- Réponds UNIQUEMENT avec le JSON, aucun texte avant ou après
`.trim();

@Injectable()
export class MenuAiHandler {
  private readonly logger = new Logger(MenuAiHandler.name);
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extractFromPhoto(photoUrl: string, language = 'fr'): Promise<ExtractedMenuItem[]> {
    this.logger.log(`[menu-ai] extraction depuis ${photoUrl}`);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: photoUrl },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT(language),
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    try {
      // Extrait le JSON même si Claude entoure de backticks
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn(`[menu-ai] aucun JSON trouvé dans la réponse`);
        return [];
      }
      const items = JSON.parse(jsonMatch[0]) as ExtractedMenuItem[];
      this.logger.log(`[menu-ai] ${items.length} items extraits`);
      return items.map((item) => ({
        ...item,
        currency: item.currency ?? 'EUR',
        tags: Array.isArray(item.tags) ? item.tags : [],
      }));
    } catch (err) {
      this.logger.error(`[menu-ai] parse error: ${String(err)} — réponse: ${text.slice(0, 200)}`);
      return [];
    }
  }

  /** Extraction depuis une URL de base64 data URI (photo uploadée par l'utilisateur). */
  async extractFromBase64(base64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp', language = 'fr'): Promise<ExtractedMenuItem[]> {
    this.logger.log(`[menu-ai] extraction depuis base64 (${mediaType})`);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT(language),
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const items = JSON.parse(jsonMatch[0]) as ExtractedMenuItem[];
      return items.map((item) => ({
        ...item,
        currency: item.currency ?? 'EUR',
        tags: Array.isArray(item.tags) ? item.tags : [],
      }));
    } catch {
      return [];
    }
  }
}
