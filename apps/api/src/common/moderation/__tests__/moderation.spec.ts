import { BadRequestException } from '@nestjs/common';
import { assertClean, findBlockedTerm, isObjectionable } from '../moderation';

describe('moderation', () => {
  describe('contenus acceptables', () => {
    it.each([
      'Super restaurant, je recommande !',
      'Le service était lent mais la cuisine excellente.',
      'Franchement la déco est nulle et c’était de la merde.',
      '',
      null,
      undefined,
    ])('laisse passer %p', (text) => {
      expect(isObjectionable(text)).toBe(false);
    });

    // Problème dit « de Scunthorpe » : un mot innocent ne doit pas être bloqué
    // parce qu'il contient par hasard la sous-chaîne d'un terme interdit.
    it.each([
      'Le pédalier de mon vélo est cassé',
      'On a fait du pédalo sur le lac',
      'Cette salopette est jolie',
      'On a vu un raton laveur au parc animalier', // cf. racine « raton » écartée
      'The place was spic and span',
    ])('ne bloque pas %p (sous-chaîne fortuite)', (text) => {
      expect(isObjectionable(text)).toBe(false);
    });
  });

  describe('contenus refusés', () => {
    it('détecte une insulte simple', () => {
      expect(findBlockedTerm('sale negre')).toBe('negre');
    });

    it('détecte malgré les accents', () => {
      expect(isObjectionable('sale nègre')).toBe(true);
    });

    it('détecte malgré le leetspeak', () => {
      expect(isObjectionable('sale n3gr3')).toBe(true);
    });

    it('détecte malgré les séparateurs de contournement', () => {
      expect(isObjectionable('sale n-e-g-r-e')).toBe(true);
    });

    it('détecte les flexions (pluriel, féminin)', () => {
      expect(isObjectionable('bande de tapettes')).toBe(true);
    });

    it('détecte une menace en plusieurs mots', () => {
      expect(isObjectionable('je vais te tuer sale type')).toBe(true);
    });

    it('détecte en majuscules', () => {
      expect(isObjectionable('FAGGOT')).toBe(true);
    });
  });

  describe('assertClean', () => {
    it('ne lève rien sur un contenu acceptable', () => {
      expect(() => assertClean('Très bonne adresse')).not.toThrow();
    });

    it('lève une BadRequestException sur un contenu interdit', () => {
      expect(() => assertClean('sale negre')).toThrow(BadRequestException);
    });

    it('ne révèle pas le terme détecté dans le message d’erreur', () => {
      try {
        assertClean('sale negre');
        fail('aurait dû lever');
      } catch (err) {
        expect((err as Error).message).not.toContain('negre');
      }
    });
  });
});
