/**
 * Barrière d'âge à la création de compte.
 *
 * Elle existe parce que YUMIA référence des lieux réservés aux adultes (bars,
 * caves à vin, casinos, armureries) et met des personnes en relation. 16 ans
 * est la valeur déclarée aux boutiques et écrite dans les conditions
 * d'utilisation : les trois doivent rester d'accord.
 *
 * Le serveur refait le même calcul (`apps/api/src/modules/auth/age.ts`) — ce
 * fichier n'est que la version confortable, côté écran.
 */
import { ApiError } from './api';

export const MIN_SIGNUP_AGE = 16;

/** Le serveur réclame une date de naissance avant de créer le compte. */
export const AGE_REQUIRED = 'AGE_REQUIRED';
/** La date fournie est en dessous de la barrière. */
export const AGE_TOO_YOUNG = 'AGE_TOO_YOUNG';

/** `true` si cette erreur signifie « il me faut la date de naissance ». */
export function isAgeRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.code === AGE_REQUIRED;
}

/** `true` si cette erreur signifie « trop jeune ». */
export function isTooYoungError(err: unknown): boolean {
  return err instanceof ApiError && err.code === AGE_TOO_YOUNG;
}

/**
 * Construit une date ISO (AAAA-MM-JJ) à partir des trois champs saisis, ou
 * `null` si la date n'existe pas.
 *
 * Le 31 février doit échouer : `new Date(2000, 1, 31)` le reporte
 * silencieusement au 2 mars, ce qui ferait passer une saisie absurde.
 */
export function toIsoBirthDate(day: number, month: number, year: number): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Âge révolu aujourd'hui, ou `null` si la date est invalide. */
export function ageFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  const beforeBirthday =
    now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
