/**
 * Formatage des instants dans le fuseau du **lieu observé**, pas celui du
 * téléphone.
 *
 * Technique : on décale l'instant du `utcOffsetSeconds` du lieu, puis on lit
 * les composantes en UTC. On obtient ainsi l'heure murale locale sans dépendre
 * du fuseau de l'appareil — nécessaire dès qu'on consulte la météo d'une
 * destination (Tokyo depuis Paris doit afficher l'heure de Tokyo).
 */

function localParts(iso: string, utcOffsetSeconds: number): Date {
  return new Date(new Date(iso).getTime() + utcOffsetSeconds * 1000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Heure locale du lieu, au format « 14:30 ». */
export function formatLocalTime(iso: string, utcOffsetSeconds: number): string {
  const d = localParts(iso, utcOffsetSeconds);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Heure locale compacte pour la bande horaire, au format « 14h ». */
export function formatLocalHour(iso: string, utcOffsetSeconds: number): string {
  return `${pad(localParts(iso, utcOffsetSeconds).getUTCHours())}h`;
}

const WEEKDAYS: Record<string, string[]> = {
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  ar: ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'],
};

/** Jour de la semaine abrégé, dans le fuseau du lieu. */
export function formatLocalWeekday(iso: string, utcOffsetSeconds: number, locale = 'fr'): string {
  return (WEEKDAYS[locale] ?? WEEKDAYS.fr)[localParts(iso, utcOffsetSeconds).getUTCDay()];
}

/**
 * Vrai si l'instant tombe le même jour local que `reference` (par défaut :
 * maintenant), dans le fuseau du lieu.
 */
export function isSameLocalDay(iso: string, utcOffsetSeconds: number, reference = new Date()): boolean {
  const a = localParts(iso, utcOffsetSeconds);
  const b = localParts(reference.toISOString(), utcOffsetSeconds);
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}
