import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Bornes partagées avec le service (troncature défensive côté serveur). */
export const CHATBOT_MESSAGE_MAX = 2000;
export const CHATBOT_HISTORY_MAX_ITEMS = 20;
export const CHATBOT_HISTORY_CONTENT_MAX = 4000;

export class ChatbotHistoryItemDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  // Les réponses de l'assistant sont bornées à 512 tokens (~2 500 caractères) :
  // 4 000 laisse de la marge sans ouvrir la porte à un historique de 1 Mo.
  @IsString()
  @MaxLength(CHATBOT_HISTORY_CONTENT_MAX)
  content!: string;
}

export class ChatbotMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CHATBOT_MESSAGE_MAX)
  message!: string;

  // L'app envoie les 10 derniers messages ; 20 laisse de la marge.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHATBOT_HISTORY_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ChatbotHistoryItemDto)
  history?: ChatbotHistoryItemDto[];

  /** Ville résolue par l'app — évite à l'assistant de la redemander. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
