import type { Astro, DayMoment } from './types';

/**
 * Calculs astronomiques faits côté client.
 *
 * Aucun fournisseur météo grand public ne renvoie la phase lunaire ni l'heure
 * dorée : on les dérive nous-mêmes. C'est gratuit, instantané, et ça marche
 * quel que soit le fournisseur branché derrière.
 */

/** Durée moyenne d'une lunaison (mois synodique), en jours. */
const SYNODIC_MONTH = 29.530588853;

/** Nouvelle lune de référence : 6 janvier 2000, 18h14 UTC. */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) ;

/**
 * Phase lunaire de 0 à 1 (0 = nouvelle lune, 0.5 = pleine lune) et fraction
 * éclairée du disque.
 */
export function moonAt(date: Date): { phase: number; illumination: number } {
  const daysSince = (date.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  // `%` peut être négatif en JS pour les dates antérieures à la référence.
  const phase = ((daysSince / SYNODIC_MONTH) % 1 + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { phase, illumination };
}

/** Nom français de la phase lunaire. */
const MOON_PHASES: Record<string, string[]> = {
  fr: ['Nouvelle lune', 'Premier croissant', 'Premier quartier', 'Gibbeuse croissante', 'Pleine lune', 'Gibbeuse décroissante', 'Dernier quartier', 'Dernier croissant'],
  en: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
  es: ['Luna nueva', 'Creciente iluminante', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Creciente menguante'],
  pt: ['Lua nova', 'Crescente iluminante', 'Quarto crescente', 'Gibosa crescente', 'Lua cheia', 'Gibosa minguante', 'Quarto minguante', 'Minguante'],
  ar: ['محاق', 'هلال متزايد', 'تربيع أول', 'أحدب متزايد', 'بدر', 'أحدب متناقص', 'تربيع أخير', 'هلال متناقص'],
};

export function moonPhaseLabel(phase: number, locale = 'fr'): string {
  const labels = MOON_PHASES[locale] ?? MOON_PHASES.fr;
  if (phase < 0.03 || phase > 0.97) return labels[0];
  if (phase < 0.22) return labels[1];
  if (phase < 0.28) return labels[2];
  if (phase < 0.47) return labels[3];
  if (phase < 0.53) return labels[4];
  if (phase < 0.72) return labels[5];
  if (phase < 0.78) return labels[6];
  return labels[7];
}

/** Emoji correspondant à la phase — orienté hémisphère nord. */
export function moonPhaseEmoji(phase: number): string {
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return icons[Math.round(phase * 8) % 8];
}

/**
 * Durée de l'heure dorée, en minutes.
 *
 * L'heure dorée couvre une élévation solaire de -4° à +6°, soit 10° à franchir.
 * Près de l'horizon le soleil descend d'environ 15°/heure × cos(latitude) :
 * plus on s'éloigne de l'équateur, plus la lumière traîne. C'est une
 * approximation (elle ignore la déclinaison saisonnière) mais elle reste juste
 * à quelques minutes près aux latitudes habitées, et évite d'embarquer un
 * moteur d'éphémérides complet pour un affichage indicatif.
 */
function goldenHourMinutes(latitude: number): number {
  const cos = Math.cos((Math.abs(latitude) * Math.PI) / 180);
  // Plancher sur cos pour éviter une durée qui explose près des pôles.
  const degreesPerHour = 15 * Math.max(cos, 0.15);
  const minutes = (10 / degreesPerHour) * 60;
  return Math.min(minutes, 180);
}

function shift(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function buildAstro(
  sunrise: string,
  sunset: string,
  latitude: number,
  now = new Date(),
): Astro {
  const span = goldenHourMinutes(latitude);
  const { phase, illumination } = moonAt(now);

  return {
    sunrise,
    sunset,
    goldenHourMorning: { start: sunrise, end: shift(sunrise, span) },
    goldenHourEvening: { start: shift(sunset, -span), end: sunset },
    moonPhase: phase,
    moonIllumination: illumination,
  };
}

/**
 * Moment de la journée, utilisé pour choisir l'ambiance visuelle de l'écran.
 * Les fenêtres « lever » et « coucher » correspondent aux heures dorées.
 */
export function dayMomentAt(now: Date, astro: Astro, latitude: number): DayMoment {
  const t = now.getTime();
  const sunrise = new Date(astro.sunrise).getTime();
  const sunset = new Date(astro.sunset).getTime();
  const span = goldenHourMinutes(latitude) * 60_000;

  if (t < sunrise - span || t > sunset + span) return 'night';
  if (t <= sunrise + span) return 'sunrise';
  if (t >= sunset - span) return 'sunset';
  return 'day';
}
