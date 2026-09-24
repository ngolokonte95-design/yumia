import { shouldOfferTranslation } from '../detect-language';

describe('shouldOfferTranslation', () => {
  it('propose de traduire un autre alphabet', () => {
    expect(shouldOfferTranslation('这个地方真的很漂亮', 'fr')).toBe(true);
    expect(shouldOfferTranslation('Très bel endroit pour dîner', 'zh')).toBe(true);
    expect(shouldOfferTranslation('Очень красивое место', 'fr')).toBe(true);
  });

  it('ne propose rien pour un texte déjà dans la langue de l’utilisateur', () => {
    expect(shouldOfferTranslation('Le meilleur restaurant de la ville, je recommande', 'fr')).toBe(false);
    expect(shouldOfferTranslation('这个地方真的很漂亮', 'zh')).toBe(false);
  });

  it('distingue deux langues latines grâce aux mots courants', () => {
    expect(shouldOfferTranslation('This is the best place and the food is amazing', 'fr')).toBe(true);
    expect(shouldOfferTranslation('Das ist der beste Ort und die Musik ist sehr gut', 'fr')).toBe(true);
  });

  it("s'abstient faute d'indice (texte court, emojis)", () => {
    expect(shouldOfferTranslation('Super 🔥🔥', 'fr')).toBe(false);
    expect(shouldOfferTranslation('ok', 'zh')).toBe(false);
  });
});
