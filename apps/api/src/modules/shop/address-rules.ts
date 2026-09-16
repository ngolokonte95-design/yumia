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

/**
 * Région française déduite du code postal, au format attendu par AliExpress.
 *
 * AliExpress refuse une commande française sans région (« Please select a
 * State/Province/County ») et n'accepte pas la ville en repli : c'est ce qui
 * a bloqué YUM-E2EE26 une fois le nom corrigé. Le champ saisi par le client
 * ne s'y prête pas — « 95 », « Val-d'Oise » et « IDF » désignent la même
 * chose. Le code postal, lui, est sans ambiguïté : ses deux premiers chiffres
 * sont le département (trois pour l'outre-mer).
 *
 * Noms sans accents, comme dans les listes d'adresses d'AliExpress — format
 * supposé, à confirmer par la première commande acceptée. Si AliExpress en
 * attendait un autre, `retry-order --region=…` permet d'essayer sans repayer.
 */
const REGIONS_PAR_DEPARTEMENT: Record<string, string> = {};
const REGIONS: Array<[string, string[]]> = [
  ['Auvergne-Rhone-Alpes', ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74']],
  ['Bourgogne-Franche-Comte', ['21', '25', '39', '58', '70', '71', '89', '90']],
  ['Bretagne', ['22', '29', '35', '56']],
  ['Centre-Val de Loire', ['18', '28', '36', '37', '41', '45']],
  ['Corse', ['20']],
  ['Grand Est', ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88']],
  ['Hauts-de-France', ['02', '59', '60', '62', '80']],
  ['Ile-de-France', ['75', '77', '78', '91', '92', '93', '94', '95']],
  ['Normandie', ['14', '27', '50', '61', '76']],
  ['Nouvelle-Aquitaine', ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87']],
  ['Occitanie', ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82']],
  ['Pays de la Loire', ['44', '49', '53', '72', '85']],
  ["Provence-Alpes-Cote d'Azur", ['04', '05', '06', '13', '83', '84']],
  ['Guadeloupe', ['971']],
  ['Martinique', ['972']],
  ['Guyane', ['973']],
  ['La Reunion', ['974']],
  ['Mayotte', ['976']],
];
for (const [region, departements] of REGIONS) {
  for (const d of departements) REGIONS_PAR_DEPARTEMENT[d] = region;
}

export function frenchRegionFromPostalCode(postalCode: string | null | undefined): string | null {
  const cp = (postalCode ?? '').replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  return REGIONS_PAR_DEPARTEMENT[cp.slice(0, 3)] ?? REGIONS_PAR_DEPARTEMENT[cp.slice(0, 2)] ?? null;
}

/**
 * Région à transmettre à AliExpress.
 *
 * France : toujours déduite du code postal quand il est valide, quoi qu'ait
 * saisi le client. Ailleurs : la région saisie, sinon la ville.
 */
export function aliexpressProvince(address: {
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}): string {
  if ((address.countryCode ?? 'FR').toUpperCase() === 'FR') {
    const region = frenchRegionFromPostalCode(address.postalCode);
    if (region) return region;
  }
  return address.province?.trim() || address.city?.trim() || '';
}

/** Premier problème bloquant d'une adresse, ou `null`. */
export function shippingAddressProblem(address: {
  fullName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
}): string | null {
  return recipientNameProblem(address.fullName) ?? phoneProblem(address.phone, address.countryCode);
}
