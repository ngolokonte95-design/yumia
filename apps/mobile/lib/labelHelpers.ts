/**
 * Libellés traduits pour les modes/humeurs (même principe que universeLabel
 * dans universeMeta.ts) — retombe sur le libellé français si la clé de
 * traduction est absente (univers/mode ajouté après la dernière traduction).
 */
import type { TranslationKey } from './translations';

type T = (key: TranslationKey) => string;

export function modeLabel(t: T, mode: string, fallbackFr: string): string {
  const key = `mode_${mode}` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

export function moodLabel(t: T, mood: string, fallbackFr: string): string {
  const key = `mood_${mood}` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Badge d'exploration (Aventurier, On Fire…) — nom traduit. */
export function badgeName(t: T, badge: string, fallbackFr: string): string {
  const key = `badge_${badge}_name` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Badge d'exploration — condition d'obtention traduite. */
export function badgeCondition(t: T, badge: string, fallbackFr: string): string {
  const key = `badge_${badge}_cond` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Badge de statut (Plus/Gold/Diamond) — libellé traduit. */
export function planBadgeLabel(t: T, plan: string, fallbackFr: string): string {
  const key = `plan_badge_${plan}` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Mood d'itinéraire (date/amis/famille/solo/touriste) — libellé traduit. */
export function itineraryMoodLabel(t: T, mood: string, fallbackFr: string): string {
  const key = `itinmood_${mood}_label` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Mood d'itinéraire — sous-titre traduit. */
export function itineraryMoodSub(t: T, mood: string, fallbackFr: string): string {
  const key = `itinmood_${mood}_sub` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Condition météo (WeatherKind) — libellé traduit. */
export function weatherKindLabel(t: T, kind: string, fallbackFr: string): string {
  const key = `weather_kind_${kind}` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}

/** Catégorie d'événement calendrier — libellé traduit. */
export function calendarCategoryLabel(t: T, category: string, fallbackFr: string): string {
  const key = `calendar_cat_${category}` as TranslationKey;
  const translated = t(key);
  return translated === key ? fallbackFr : translated;
}
