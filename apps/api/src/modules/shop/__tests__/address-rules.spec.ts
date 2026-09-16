import {
  aliexpressProvince,
  frenchRegionFromPostalCode,
  normalizeRecipientName,
  phoneProblem,
  recipientNameProblem,
  shippingAddressProblem,
  splitPhone,
} from '../address-rules';

describe('nom du destinataire', () => {
  // C'est ce qui a fait refuser la commande YUM-E2EE26 par AliExpress,
  // après encaissement : « Please enter your first name ».
  it('refuse un nom en un seul mot', () => {
    expect(recipientNameProblem('Dupont')).not.toBeNull();
    expect(recipientNameProblem('  Dupont  ')).not.toBeNull();
    expect(recipientNameProblem('')).not.toBeNull();
    expect(recipientNameProblem(null)).not.toBeNull();
  });

  it("ne compte pas comme un mot ce qui n'a aucune lettre", () => {
    expect(recipientNameProblem('Dupont .')).not.toBeNull();
    expect(recipientNameProblem('Dupont 2')).not.toBeNull();
  });

  it('accepte prénom et nom, initiale comprise, accents et tirets', () => {
    expect(recipientNameProblem('Marie Dupont')).toBeNull();
    expect(recipientNameProblem('J Dupont')).toBeNull();
    expect(recipientNameProblem('Jean-Éric de La Fontaine')).toBeNull();
  });

  it('nettoie les espaces superflus', () => {
    expect(normalizeRecipientName('  Marie   Dupont ')).toBe('Marie Dupont');
  });
});

describe('téléphone', () => {
  it("sépare l'indicatif du numéro national, quelle que soit l'écriture", () => {
    for (const saisie of ['06 12 34 56 78', '0612345678', '+33 6 12 34 56 78', '0033612345678', '06.12.34.56.78', '+33 06 12 34 56 78']) {
      expect(splitPhone(saisie, 'FR')).toEqual({ country: '33', national: '612345678' });
    }
  });

  it("garde le 0 initial en Italie, où il fait partie du numéro", () => {
    expect(splitPhone('+39 06 1234 5678', 'IT')).toEqual({ country: '39', national: '0612345678' });
  });

  it('refuse un numéro français trop court ou trop long', () => {
    expect(phoneProblem('06 12 34 56', 'FR')).not.toBeNull();
    expect(phoneProblem('06 12 34 56 78 90', 'FR')).not.toBeNull();
    expect(phoneProblem('', 'FR')).not.toBeNull();
  });

  it('accepte un numéro français valide', () => {
    expect(phoneProblem('06 12 34 56 78', 'FR')).toBeNull();
    expect(phoneProblem('+33 1 23 45 67 89', 'FR')).toBeNull();
  });

  it("reste tolérant pour un pays sans règle précise", () => {
    expect(phoneProblem('+1 415 555 0100', 'US')).toBeNull();
    expect(splitPhone('555 0100 12', 'JP')).toEqual({ country: null, national: '555010012' });
  });
});

describe('adresse complète', () => {
  it('signale le nom avant le téléphone', () => {
    expect(shippingAddressProblem({ fullName: 'Dupont', phone: '12', countryCode: 'FR' })).toMatch(/prénom/);
    expect(shippingAddressProblem({ fullName: 'Marie Dupont', phone: '12', countryCode: 'FR' })).toMatch(/téléphone/);
    expect(shippingAddressProblem({ fullName: 'Marie Dupont', phone: '0612345678', countryCode: 'FR' })).toBeNull();
  });
});

describe('région française', () => {
  // Seconde cause du refus de YUM-E2EE26 : « Please select a
  // State/Province/County », la ville en repli n'étant pas acceptée.
  it('déduit la région du code postal', () => {
    expect(frenchRegionFromPostalCode('75011')).toBe('Ile-de-France');
    expect(frenchRegionFromPostalCode('95100')).toBe('Ile-de-France');
    expect(frenchRegionFromPostalCode('69003')).toBe('Auvergne-Rhone-Alpes');
    expect(frenchRegionFromPostalCode('13001')).toBe("Provence-Alpes-Cote d'Azur");
    expect(frenchRegionFromPostalCode('20000')).toBe('Corse');
    expect(frenchRegionFromPostalCode('97400')).toBe('La Reunion');
    expect(frenchRegionFromPostalCode('01000')).toBe('Auvergne-Rhone-Alpes');
  });

  it('ne devine rien sur un code postal invalide', () => {
    expect(frenchRegionFromPostalCode('7501')).toBeNull();
    expect(frenchRegionFromPostalCode('ABCDE')).toBeNull();
    expect(frenchRegionFromPostalCode('')).toBeNull();
  });

  it("couvre les 96 départements métropolitains", () => {
    const manquants: string[] = [];
    for (let d = 1; d <= 95; d += 1) {
      const dep = String(d).padStart(2, '0');
      if (!frenchRegionFromPostalCode(`${dep}000`)) manquants.push(dep);
    }
    expect(manquants).toEqual([]);
  });

  it('préfère le code postal à la saisie en France, la saisie ailleurs', () => {
    expect(aliexpressProvince({ countryCode: 'FR', postalCode: '95100', province: 'IDF', city: 'Argenteuil' })).toBe('Ile-de-France');
    expect(aliexpressProvince({ countryCode: 'BE', postalCode: '1000', province: 'Bruxelles-Capitale', city: 'Bruxelles' })).toBe('Bruxelles-Capitale');
    expect(aliexpressProvince({ countryCode: 'BE', postalCode: '1000', province: '', city: 'Bruxelles' })).toBe('Bruxelles');
  });
});
