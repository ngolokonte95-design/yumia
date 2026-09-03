/**
 * Utilitaires de dates du calendrier.
 *
 * Toutes les fonctions raisonnent en **heure locale de l'appareil** : la grille
 * d'un mois, elle, n'a de sens que dans le fuseau de celui qui la regarde.
 * L'heure affichée d'un événement, en revanche, suit le fuseau du lieu — voir
 * `formatEventTime`.
 */

/** Repli par défaut (français) — préférer {@link weekdaysFor} pour une locale précise. */
export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
/** Repli par défaut (français) — préférer {@link monthsFor} pour une locale précise. */
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const WEEKDAYS_BY_LOCALE: Record<string, string[]> = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  pt: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
  ar: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'],
};

const MONTHS_BY_LOCALE: Record<string, string[]> = {
  fr: MONTHS,
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

const WEEKDAYS_LONG_BY_LOCALE: Record<string, string[]> = {
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

/** Initiales des jours de la semaine (en-tête de la grille mensuelle), dans une locale donnée. */
export function weekdaysFor(locale = 'fr'): string[] {
  return WEEKDAYS_BY_LOCALE[locale] ?? WEEKDAYS_BY_LOCALE.fr;
}

/** Noms complets des mois, dans une locale donnée. */
export function monthsFor(locale = 'fr'): string[] {
  return MONTHS_BY_LOCALE[locale] ?? MONTHS_BY_LOCALE.fr;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  // On se place au 1er avant de décaler : sinon le 31 janvier + 1 mois
  // déborderait sur mars.
  c.setDate(1);
  c.setMonth(c.getMonth() + n);
  return c;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Clé stable `AAAA-MM-JJ` en heure locale, pour indexer les événements par jour. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Grille du mois : toujours 6 semaines complètes (42 cases), débordant sur les
 * mois voisins. Une hauteur fixe évite que la grille saute d'un mois à l'autre.
 * La semaine commence le lundi.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() renvoie 0 pour dimanche ; on décale pour un début lundi.
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Bornes de la période à interroger pour afficher un mois entier. */
export function monthRange(month: Date): { from: Date; to: Date } {
  const grid = monthGrid(month);
  return { from: startOfDay(grid[0]), to: endOfDay(grid[grid.length - 1]) };
}

/** Bornes de la semaine contenant `d` (du lundi au dimanche). */
export function weekRange(d: Date): { from: Date; to: Date } {
  const offset = (d.getDay() + 6) % 7;
  const monday = addDays(d, -offset);
  return { from: startOfDay(monday), to: endOfDay(addDays(monday, 6)) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Heure d'un événement **dans le fuseau de son lieu**.
 *
 * Un dîner réservé à Tokyo doit afficher 20:00 même consulté depuis Paris.
 * `Intl` fait la conversion ; en cas de fuseau inconnu, on retombe sur l'heure
 * locale plutôt que de ne rien afficher.
 */
export function formatEventTime(iso: string, timezone?: string): string {
  const date = new Date(iso);
  if (!timezone || timezone === 'UTC') {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: timezone, hour12: false,
    }).format(date);
  } catch {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/** Vrai si l'événement se déroule dans un autre fuseau que celui de l'appareil. */
export function isForeignTimezone(timezone?: string): boolean {
  if (!timezone || timezone === 'UTC') return false;
  try {
    return timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return false;
  }
}

/** Libellé long : « Mercredi 5 août ». */
export function formatLongDate(d: Date, locale = 'fr'): string {
  const days = WEEKDAYS_LONG_BY_LOCALE[locale] ?? WEEKDAYS_LONG_BY_LOCALE.fr;
  const months = monthsFor(locale);
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()].toLowerCase()}`;
}
