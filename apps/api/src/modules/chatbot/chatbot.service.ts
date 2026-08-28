import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../infra/prisma/prisma.service';

const SYSTEM_PROMPT = `Tu es YUMIA Assistant, un copilote IA pour découvrir des expériences du quotidien (restaurants, cafés, bars, activités, sorties, culture...).

Ton rôle :
- Aider l'utilisateur à trouver des lieux selon ses envies, humeur, budget, compagnie
- Suggérer des activités et expériences adaptées à sa localisation
- Donner des recommandations personnalisées basées sur ses préférences
- Organiser des sorties et créer des plans de soirée/journée

Tu réponds toujours en français (sauf si l'utilisateur parle une autre langue), de façon chaleureuse et enthousiaste.
Tu es concis (max 3-4 phrases sauf si l'utilisateur demande plus de détails).
Tu utilises des emojis avec modération pour rendre la conversation vivante.

IMPORTANT — format de réponse : tes messages s'affichent en texte brut dans l'app (aucun rendu Markdown). N'utilise donc JAMAIS de syntaxe Markdown : pas d'astérisques pour le gras/italique, pas de tirets ou puces en début de ligne, pas de underscore, pas de dièse pour les titres, pas de crochets/parenthèses pour des liens. Écris en phrases normales, ponctuées naturellement. Pour énumérer plusieurs options, utilise des phrases séparées ou des numéros suivis d'un point ("1. ", "2. "), jamais de tirets ni d'astérisques.`;

/**
 * Filet de sécurité si l'IA glisse malgré tout de la syntaxe Markdown —
 * l'écran de chat affiche du texte brut, sans rendu Markdown.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')            // titres "# "
    .replace(/\*\*(.+?)\*\*/g, '$1')        // gras **texte**
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1') // italique *texte*
    .replace(/^[ \t]*[-*]\s+/gm, '')        // puces "- " ou "* " en début de ligne
    .replace(/_{2}(.+?)_{2}/g, '$1')        // gras __texte__
    .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1'); // italique _texte_
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ai = new Anthropic();

  constructor(private readonly prisma: PrismaService) {}

  async chat(userId: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
    // Contexte utilisateur
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, preferences: true, totalXp: true, level: true },
    });

    const contextualSystem = user
      ? `${SYSTEM_PROMPT}\n\nContexte utilisateur : ${user.displayName}, niveau ${user.level}, ${user.totalXp} XP.`
      : SYSTEM_PROMPT;

    const messages: Anthropic.Messages.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    try {
      const response = await this.ai.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: contextualSystem,
        messages,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return { reply: stripMarkdown(text), role: 'assistant' as const };
    } catch (err) {
      this.logger.error(`[chatbot] Error: ${String(err)}`);
      return { reply: "Désolé, je rencontre un problème momentané. Réessaie dans quelques instants ! 😊", role: 'assistant' as const };
    }
  }
}
