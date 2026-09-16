import {
  aliexpressProvince,
  frenchDepartmentFromPostalCode,
  matchAliexpressCity,
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

describe('département français au sens d\'AliExpress', () => {
  // YUM-E2EE26 refusée avec la ville, puis avec « Ile-de-France » : la liste
  // d'AliExpress est faite de départements.
  it('déduit le département du code postal, écrit comme AliExpress', () => {
    expect(frenchDepartmentFromPostalCode('75011')).toBe('Paris');
    expect(frenchDepartmentFromPostalCode('95100')).toBe("Val-d'Oise");
    expect(frenchDepartmentFromPostalCode('69003')).toBe('Rhone');
    expect(frenchDepartmentFromPostalCode('21000')).toBe("Cote-d'Or");
    expect(frenchDepartmentFromPostalCode('90000')).toBe('Territoire de Belfort');
    expect(frenchDepartmentFromPostalCode('01000')).toBe('Ain');
  });

  it('sépare les deux départements corses', () => {
    expect(frenchDepartmentFromPostalCode('20000')).toBe('Corse-du-Sud');
    expect(frenchDepartmentFromPostalCode('20137')).toBe('Corse-du-Sud');
    expect(frenchDepartmentFromPostalCode('20200')).toBe('Haute-Corse');
    expect(frenchDepartmentFromPostalCode('20600')).toBe('Haute-Corse');
  });

  it('couvre les 96 départements métropolitains', () => {
    const vus = new Set<string>();
    for (let d = 1; d <= 95; d += 1) {
      if (d === 20) continue;
      const nom = frenchDepartmentFromPostalCode(`${String(d).padStart(2, '0')}000`);
      expect(nom).not.toBeNull();
      vus.add(nom!);
    }
    vus.add(frenchDepartmentFromPostalCode('20000')!);
    vus.add(frenchDepartmentFromPostalCode('20200')!);
    expect(vus.size).toBe(96);
  });

  it('se rabat sur « Other » en France, sur la saisie ailleurs', () => {
    expect(aliexpressProvince({ countryCode: 'FR', postalCode: '95100', province: 'IDF', city: 'Argenteuil' })).toBe("Val-d'Oise");
    expect(aliexpressProvince({ countryCode: 'FR', postalCode: '97400', province: '', city: 'Saint-Denis' })).toBe('Other');
    expect(aliexpressProvince({ countryCode: 'BE', postalCode: '1000', province: 'Bruxelles-Capitale', city: 'Bruxelles' })).toBe('Bruxelles-Capitale');
    expect(aliexpressProvince({ countryCode: 'BE', postalCode: '1000', province: '', city: 'Bruxelles' })).toBe('Bruxelles');
  });
});

describe('ville au sens d\'AliExpress', () => {
  const ain = ['ARVIERE-EN-VALROMEY', 'Amberieu-en-bugey', 'Arboys en bugey', 'BRESSE VALLONS', 'Saint-Denis-les-Bourg'];

  it("retrouve l'écriture d'AliExpress malgré accents, casse et tirets", () => {
    expect(matchAliexpressCity('Ambérieu-en-Bugey', ain)).toBe('Amberieu-en-bugey');
    expect(matchAliexpressCity('Arvière en Valromey', ain)).toBe('ARVIERE-EN-VALROMEY');
    expect(matchAliexpressCity('Arboys-en-Bugey', ain)).toBe('Arboys en bugey');
    expect(matchAliexpressCity('bresse-vallons', ain)).toBe('BRESSE VALLONS');
  });

  it('développe « St » en « Saint »', () => {
    expect(matchAliexpressCity('St-Denis-lès-Bourg', ain)).toBe('Saint-Denis-les-Bourg');
  });

  it("ne propose rien d'approchant quand la ville n'y est pas", () => {
    expect(matchAliexpressCity('Belley', ain)).toBeNull();
    expect(matchAliexpressCity('', ain)).toBeNull();
  });
});
