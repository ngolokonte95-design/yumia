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
 * « Province » française au sens d'AliExpress, déduite du code postal.
 *
 * AliExpress ne découpe pas la France en régions mais en départements : sa
 * liste (interrogée le 16/09/2026 via `aliexpress.ds.address.get`, script
 * `aliexpress-address-probe`) compte les 96 départements métropolitains et
 * une entrée « Other ». C'est pourquoi YUM-E2EE26 a été refusée deux fois —
 * avec la ville, puis avec « Ile-de-France » : « Please select a
 * State/Province/County ».
 *
 * Les noms ci-dessous sont recopiés de cette liste, à l'écriture près (sans
 * accents, « Cote-d'Or », « Territoire de Belfort »). Ne pas les « corriger ».
 *
 * Le code postal plutôt que la saisie du client : « 95 », « Val-d'Oise » et
 * « val d oise » désignent le même département, et seul le code postal est
 * sans ambiguïté. L'outre-mer n'a pas d'entrée chez AliExpress.
 */
const DEPARTEMENTS_ALIEXPRESS: Record<string, string> = {
  '01': 'Ain',
  '02': 'Aisne',
  '03': 'Allier',
  '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes',
  '07': 'Ardeche',
  '08': 'Ardennes',
  '09': 'Ariege',
  '10': 'Aube',
  '11': 'Aude',
  '12': 'Aveyron',
  '13': 'Bouches-du-Rhone',
  '14': 'Calvados',
  '15': 'Cantal',
  '16': 'Charente',
  '17': 'Charente-Maritime',
  '18': 'Cher',
  '19': 'Correze',
  '21': "Cote-d'Or",
  '22': "Cotes-d'Armor",
  '23': 'Creuse',
  '24': 'Dordogne',
  '25': 'Doubs',
  '26': 'Drome',
  '27': 'Eure',
  '28': 'Eure-et-Loir',
  '29': 'Finistere',
  '30': 'Gard',
  '31': 'Haute-Garonne',
  '32': 'Gers',
  '33': 'Gironde',
  '34': 'Herault',
  '35': 'Ille-et-Vilaine',
  '36': 'Indre',
  '37': 'Indre-et-Loire',
  '38': 'Isere',
  '39': 'Jura',
  '40': 'Landes',
  '41': 'Loir-et-Cher',
  '42': 'Loire',
  '43': 'Haute-Loire',
  '44': 'Loire-Atlantique',
  '45': 'Loiret',
  '46': 'Lot',
  '47': 'Lot-et-Garonne',
  '48': 'Lozere',
  '49': 'Maine-et-Loire',
  '50': 'Manche',
  '51': 'Marne',
  '52': 'Haute-Marne',
  '53': 'Mayenne',
  '54': 'Meurthe-et-Moselle',
  '55': 'Meuse',
  '56': 'Morbihan',
  '57': 'Moselle',
  '58': 'Nievre',
  '59': 'Nord',
  '60': 'Oise',
  '61': 'Orne',
  '62': 'Pas-de-Calais',
  '63': 'Puy-de-Dome',
  '64': 'Pyrenees-Atlantiques',
  '65': 'Hautes-Pyrenees',
  '66': 'Pyrenees-Orientales',
  '67': 'Bas-Rhin',
  '68': 'Haut-Rhin',
  '69': 'Rhone',
  '70': 'Haute-Saone',
  '71': 'Saone-et-Loire',
  '72': 'Sarthe',
  '73': 'Savoie',
  '74': 'Haute-Savoie',
  '75': 'Paris',
  '76': 'Seine-Maritime',
  '77': 'Seine-et-Marne',
  '78': 'Yvelines',
  '79': 'Deux-Sevres',
  '80': 'Somme',
  '81': 'Tarn',
  '82': 'Tarn-et-Garonne',
  '83': 'Var',
  '84': 'Vaucluse',
  '85': 'Vendee',
  '86': 'Vienne',
  '87': 'Haute-Vienne',
  '88': 'Vosges',
  '89': 'Yonne',
  '90': 'Territoire de Belfort',
  '91': 'Essonne',
  '92': 'Hauts-de-Seine',
  '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne',
  '95': "Val-d'Oise",
};

export function frenchDepartmentFromPostalCode(postalCode: string | null | undefined): string | null {
  const cp = (postalCode ?? '').replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return null;
  // La Corse partage le préfixe 20 : 200xx et 201xx pour la Corse-du-Sud,
  // 202xx à 206xx pour la Haute-Corse.
  if (cp.startsWith('20')) return Number(cp[2]) <= 1 ? 'Corse-du-Sud' : 'Haute-Corse';
  return DEPARTEMENTS_ALIEXPRESS[cp.slice(0, 2)] ?? null;
}

/**
 * Province à transmettre à AliExpress.
 *
 * France : le département déduit du code postal, sinon « Other » — la seule
 * valeur hors département que sa liste accepte. Ailleurs : la région saisie,
 * sinon la ville.
 */
export function aliexpressProvince(address: {
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}): string {
  if ((address.countryCode ?? 'FR').toUpperCase() === 'FR') {
    return frenchDepartmentFromPostalCode(address.postalCode) ?? 'Other';
  }
  return address.province?.trim() || address.city?.trim() || '';
}

/**
 * Forme comparable d'un nom de lieu : sans accents, sans casse, ponctuation
 * ramenée à des espaces, « St » et « Ste » développés.
 *
 * La liste des villes d'AliExpress mêle « ARVIERE-EN-VALROMEY »,
 * « Amberieu-en-bugey » et « Arboys en bugey » : aucune écriture saisie par un
 * client ne s'y retrouverait à l'identique.
 */
export function comparablePlaceName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((mot) => (mot === 'st' ? 'saint' : mot === 'ste' ? 'sainte' : mot))
    .join(' ');
}

/** Ville écrite comme dans la liste d'AliExpress, ou `null` si elle n'y figure pas. */
export function matchAliexpressCity(city: string | null | undefined, candidates: string[]): string | null {
  const cible = comparablePlaceName(city);
  if (!cible) return null;
  return candidates.find((c) => comparablePlaceName(c) === cible) ?? null;
}

/** Premier problème bloquant d'une adresse, ou `null`. */
export function shippingAddressProblem(address: {
  fullName?: string | null;
  phone?: string | null;
  countryCode?: string | null;
}): string | null {
  return recipientNameProblem(address.fullName) ?? phoneProblem(address.phone, address.countryCode);
}
