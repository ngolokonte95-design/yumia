import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Les 13 langues de l'app (apps/mobile/lib/locales.ts — SUPPORTED_LOCALES). */
export const TRANSLATE_LOCALES = [
  'fr', 'en', 'es', 'pt', 'ar', 'nl', 'it', 'de', 'pl', 'sv', 'zh', 'ru', 'hi',
] as const;
export type TranslateLocale = (typeof TRANSLATE_LOCALES)[number];

/** Longueur réellement envoyée au modèle (le surplus est tronqué). */
export const TRANSLATE_TEXT_MAX = 2000;

export class TranslateDto {
  // Rejet dur au-delà de 5 000 : les légendes/bios peuvent dépasser 2 000
  // caractères, on les tronque (comportement historique) plutôt que de faire
  // échouer « Voir la traduction » ; au-delà, c'est un abus.
  @IsString()
  @MaxLength(5000)
  text!: string;

  @IsIn(TRANSLATE_LOCALES as unknown as string[])
  targetLocale!: TranslateLocale;

  /**
   * Nature du texte : 'public' (bio, légende, commentaire) ou 'message'
   * (message privé). Optionnel — l'app ne l'envoie pas encore. Un message
   * privé n'est jamais mis en cache.
   */
  @IsOptional()
  @IsIn(['public', 'message'])
  context?: 'public' | 'message';
}
