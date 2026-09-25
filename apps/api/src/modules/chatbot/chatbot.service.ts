import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CHATBOT_HISTORY_CONTENT_MAX,
  CHATBOT_HISTORY_MAX_ITEMS,
  CHATBOT_MESSAGE_MAX,
} from './dto/chatbot-message.dto';

const SYSTEM_PROMPT = `Tu es YUMIA Assistant, un copilote IA pour découvrir des expériences du quotidien (restaurants, cafés, bars, activités, sorties, culture...).

Ton rôle :
- Aider l'utilisateur à trouver des lieux selon ses envies, humeur, budget, compagnie
- Suggérer des activités et expériences adaptées à sa localisation
- Donner des recommandations personnalisées basées sur ses préférences
- Organiser des sorties et créer des plans de soirée/journée

Tu réponds toujours en français (sauf si l'utilisateur parle une autre langue), de façon chaleureuse et enthousiaste.
Tu es concis (max 3-4 phrases sauf si l'utilisateur demande plus de détails).

VA DROIT AU BUT. On vient te demander une adresse, pas remplir un formulaire.
- Réponds d'abord, demande ensuite. Jamais l'inverse.
- Au plus UNE question dans un message, et seulement si sans elle tu ne peux rien proposer du tout.
- S'il manque une information, prends l'hypothèse la plus probable, propose quand même, et dis en une incise ce que tu as supposé : "Je pars sur ce soir, près de toi."
- Le contexte plus bas te donne la ville et les goûts de l'utilisateur : ne les redemande jamais.
- Une envie vague ("j'ai faim", "je m'ennuie") est une demande complète, pas un début de conversation. Propose deux ou trois pistes concrètes.
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

/**
 * Ce que l'assistant sait de son interlocuteur avant même qu'il parle.
 *
 * Sans ces lignes, il ouvrait chaque échange par « dans quelle ville es-tu ? »
 * — une question dont l'app connaît la réponse. Les préférences étaient déjà
 * chargées ici, puis jetées sans être lues.
 */
function describeUser(
  user: {
    displayName: string;
    level: number;
    totalXp: number;
    preferences: unknown;
    countryCode: string | null;
  },
  city?: string,
): string {
  const prefs = (user.preferences ?? {}) as { favoriteUniverses?: string[]; restrictions?: string[] };
  const lines = [`Prénom : ${user.displayName}`];
  if (city) lines.push(`Ville où il se trouve maintenant : ${city}`);
  else if (user.countryCode) lines.push(`Pays : ${user.countryCode}`);
  if (prefs.favoriteUniverses?.length) {
    lines.push(`Ce qu'il aime : ${prefs.favoriteUniverses.slice(0, 8).join(', ')}`);
  }
  if (prefs.restrictions?.length) {
    lines.push(`À éviter absolument : ${prefs.restrictions.join(', ')}`);
  }
  lines.push(`Progression : niveau ${user.level}, ${user.totalXp} XP`);
  return `Contexte utilisateur — sers-t'en, ne le redemande pas :\n${lines.join('\n')}`;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ai = new Anthropic();

  constructor(private readonly prisma: PrismaService) {}

  async chat(
    userId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    place?: { city?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, preferences: true, totalXp: true, level: true, countryCode: true },
    });

    const contextualSystem = user
      ? `${SYSTEM_PROMPT}\n\n${describeUser(user, place?.city)}`
      : SYSTEM_PROMPT;

    // Troncature défensive (le DTO valide déjà) : borne le coût d'un appel
    // même si le service est appelé sans passer par la validation HTTP.
    const safeHistory = (Array.isArray(history) ? history : [])
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .slice(-CHATBOT_HISTORY_MAX_ITEMS)
      .map((h) => ({ role: h.role, content: h.content.slice(0, CHATBOT_HISTORY_CONTENT_MAX) }));
    const messages: Anthropic.Messages.MessageParam[] = [
      ...safeHistory,
      { role: 'user', content: String(message ?? '').slice(0, CHATBOT_MESSAGE_MAX) },
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
