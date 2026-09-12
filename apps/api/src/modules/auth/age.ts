import { ForbiddenException } from '@nestjs/common';

/**
 * Âge minimum pour créer un compte YUMIA.
 *
 * 16 ans, et pas 13 : l'app référence des lieux réservés aux adultes (bars,
 * caves à vin, casinos, armureries, coffee shops) et ouvre de la mise en
 * relation entre personnes. C'est la valeur déclarée aux deux boutiques et
 * celle des conditions d'utilisation — les trois doivent rester alignées.
 */
export const MIN_SIGNUP_AGE = 16;

/**
 * Code renvoyé au client quand une inscription sociale (Google / Apple) arrive
 * sans date de naissance. Le client le reconnaît pour afficher l'écran d'âge
 * puis rejouer la même requête — un simple 403 générique ne suffirait pas à
 * distinguer ce cas d'un refus d'accès.
 */
export const AGE_REQUIRED = 'AGE_REQUIRED';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Âge révolu à aujourd'hui, ou `null` si la date est absente, mal formée ou
 * inexistante (31 février). On compare les composantes plutôt que des
 * millisecondes : un calcul par différence de timestamps se trompe d'un jour
 * autour des changements d'heure.
 */
export function ageFromBirthDate(birthDate: string | undefined | null): number | null {
  if (!birthDate || !ISO_DATE.test(birthDate)) return null;
  const [year, month, day] = birthDate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Rejette les dates qui n'existent pas : Date les reporte au mois suivant.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Vérifie la date de naissance fournie à la création d'un compte.
 *
 * Renvoie l'année de naissance à enregistrer (le modèle ne garde que l'année :
 * c'est tout ce dont le profil a besoin, et c'est une donnée de moins à
 * conserver). Lève sinon — jamais de repli silencieux, sans quoi la barrière
 * ne protégerait rien.
 */
export function assertSignupAge(birthDate: string | undefined | null): number {
  const age = ageFromBirthDate(birthDate);
  if (age === null) {
    throw new ForbiddenException({
      code: AGE_REQUIRED,
      message: 'Date de naissance requise pour créer un compte.',
    });
  }
  if (age < MIN_SIGNUP_AGE) {
    throw new ForbiddenException({
      code: 'AGE_TOO_YOUNG',
      message: `YUMIA est réservé aux personnes de ${MIN_SIGNUP_AGE} ans et plus.`,
    });
  }
  return Number(birthDate!.slice(0, 4));
}
