/**
 * Règles qu'une adresse de livraison doit respecter pour qu'AliExpress
 * accepte la commande.
 *
 * Elles sont vérifiées AVANT le paiement. Le premier achat réel (commande
 * YUM-E2EE26, 16/09/2026) a été encaissé par Stripe puis refusé par
 * AliExpress — « Please enter your first name » — parce que le nom du
 * destinataire tenait en un seul mot : le client avait payé une commande qui
 * ne pouvait pas partir. Refuser l'adresse au moment où on la saisit coûte une
 * correction ; la refuser après le paiement coûte un remboursement.
 *
 * Exigences constatées : AliExpress veut un prénom ET un nom séparés par une
 * espace pour la France (comme pour le Brésil, le Japon, le Canada, l'Arabie
 * saoudite et les Émirats), et un numéro français de 9 ou 10 chiffres.
 */

/** Indicatif téléphonique par pays, sans « + ». */
const INDICATIFS: Record<string, string> = {
  FR: '33', BE: '32', CH: '41', LU: '352', MC: '377', DE: '49', ES: '34',
  IT: '39', PT: '351', NL: '31', AT: '43', IE: '353', GB: '44', US: '1', CA: '1',
};

/**
 * Pays où le 0 initial d'un numéro national disparaît une fois l'indicatif
 * ajouté (06 12 34 56 78 → +33 6 12 34 56 78). L'Italie le conserve pour les
 * fixes : elle n'y figure pas.
 */
const ZERO_INITIAL_SUPPRIME = new Set(['FR', 'BE', 'CH', 'DE', 'ES', 'PT', 'NL', 'AT', 'IE', 'GB']);

/** Chiffres attendus pour le numéro national, zéro initial retiré. */
const LONGUEURS: Record<string, [number, number]> = {
  FR: [9, 9],
  BE: [8, 9],
  CH: [9, 9],
};

/** Nom du destinataire nettoyé : espaces de tête, de fin et multiples retirés. */
export function normalizeRecipientName(fullName: string): string {
  return fullName.trim().replace(/\s+/g, ' ');
}

/**
 * Problème du nom du destinataire, ou `null` s'il convient.
 *
 * Deux mots au moins, chacun contenant une lettre : « Dupont » seul est
 * refusé, « J Dupont » accepté — l'initiale suffit à AliExpress, et
 * exiger davantage refuserait des noms réels.
 */
export function recipientNameProblem(fullName: string | null | undefined): string | null {
  const parts = normalizeRecipientName(fullName ?? '').split(' ').filter((p) => /\p{L}/u.test(p));
  if (parts.length < 2) {
    return 'Indique le prénom et le nom du destinataire, séparés par une espace (ex. : Marie Dupont).';
  }
  return null;
}

/**
 * Téléphone découpé comme AliExpress l'attend : indicatif d'un côté, numéro
 * national de l'autre. `null` si aucun chiffre exploitable.
 *
 * Accepte toutes les écritures courantes : « 06 12 34 56 78 »,
 * « +33 6 12 34 56 78 », « 0033612345678 », « 06.12.34.56.78 ».
 */
export function splitPhone(
  phone: string | null | undefined,
  countryCode: string | null | undefined,
): { country: string | null; national: string } | null {
  const pays = (countryCode ?? 'FR').toUpperCase();
  const indicatif = INDICATIFS[pays] ?? null;

  let digits = (phone ?? '').trim();
  const international = digits.startsWith('+') || digits.startsWith('00');
  digits = digits.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return null;

  if (international && indicatif && digits.startsWith(indicatif)) {
    digits = digits.slice(indicatif.length);
  }
  if (ZERO_INITIAL_SUPPRIME.has(pays) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return { country: indicatif, national: digits };
}

/** Problème du numéro de téléphone, ou `null` s'il convient. */
export function phoneProblem(
  phone: string | null | undefined,
  countryCode: string | null | undefined,
): string | null {
  const split = splitPhone(phone, countryCode);
  const invalide = 'Numéro de téléphone invalide : le transporteur en a besoin pour la livraison.';
  if (!split) return invalide;

  const [min, max] = LONGUEURS[(countryCode ?? 'FR').toUpperCase()] ?? [6, 14];
  const n = split.national.length;
  return n < min || n > max ? invalide : null;
}

/** Premier problème bloquant d'une adresse, ou `null`. */
export function shippingAddressProblem(address: {
  fullName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
}): string | null {
  return recipientNameProblem(address.fullName) ?? phoneProblem(address.phone, address.countryCode);
}
