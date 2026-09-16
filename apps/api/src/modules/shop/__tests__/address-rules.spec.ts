import {
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
