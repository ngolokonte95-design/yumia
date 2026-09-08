import { envOr } from '../env';

describe('envOr', () => {
  const NAME = 'TEST_ENV_OR';
  afterEach(() => { delete process.env[NAME]; });

  it('renvoie la valeur quand elle est définie', () => {
    process.env[NAME] = 'https://exemple.fr';
    expect(envOr(NAME, 'repli')).toBe('https://exemple.fr');
  });

  it('applique le repli quand la variable est absente', () => {
    expect(envOr(NAME, 'repli')).toBe('repli');
  });

  it('applique le repli sur une chaîne vide', () => {
    // Le cas qui a casse le paiement : docker-compose ecrit `X: ${X:-}` pour
    // rendre une variable facultative, ce qui la definit a la chaine vide.
    // `??` ne bascule pas dessus, et Stripe recevait un `success_url` sans
    // domaine.
    process.env[NAME] = '';
    expect(envOr(NAME, 'repli')).toBe('repli');
  });

  it('applique le repli sur des espaces seuls', () => {
    process.env[NAME] = '   ';
    expect(envOr(NAME, 'repli')).toBe('repli');
  });

  it('retire les espaces autour de la valeur', () => {
    // Un `.env` recopie a la main garde souvent une espace finale.
    process.env[NAME] = '  https://exemple.fr  ';
    expect(envOr(NAME, 'repli')).toBe('https://exemple.fr');
  });
});
