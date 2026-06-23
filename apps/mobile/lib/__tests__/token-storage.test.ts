import { saveTokens, loadTokens, clearTokens } from '../token-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SecureStore = require('../../test/mocks/secure-store') as {
  __reset: () => void;
  getItemAsync: (k: string) => Promise<string | null>;
};

const tokens = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  // AuthTokens peut porter d'autres champs ; seuls les deux jetons sont persistés.
} as Parameters<typeof saveTokens>[0];

describe('token-storage', () => {
  beforeEach(() => SecureStore.__reset());

  describe('saveTokens', () => {
    it('persiste les deux jetons dans SecureStore', async () => {
      await saveTokens(tokens);

      expect(await SecureStore.getItemAsync('yumia.accessToken')).toBe('access-abc');
      expect(await SecureStore.getItemAsync('yumia.refreshToken')).toBe('refresh-xyz');
    });
  });

  describe('loadTokens', () => {
    it('relit la paire de jetons écrite', async () => {
      await saveTokens(tokens);

      expect(await loadTokens()).toEqual({ accessToken: 'access-abc', refreshToken: 'refresh-xyz' });
    });

    it('retourne null quand rien n\'est stocké', async () => {
      expect(await loadTokens()).toBeNull();
    });

    it('retourne null si seul l\'access token est présent', async () => {
      const { setItemAsync } = require('../../test/mocks/secure-store');
      await setItemAsync('yumia.accessToken', 'orphan');

      expect(await loadTokens()).toBeNull();
    });

    it('retourne null si seul le refresh token est présent', async () => {
      const { setItemAsync } = require('../../test/mocks/secure-store');
      await setItemAsync('yumia.refreshToken', 'orphan');

      expect(await loadTokens()).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('supprime les deux jetons', async () => {
      await saveTokens(tokens);
      await clearTokens();

      expect(await loadTokens()).toBeNull();
      expect(await SecureStore.getItemAsync('yumia.accessToken')).toBeNull();
      expect(await SecureStore.getItemAsync('yumia.refreshToken')).toBeNull();
    });
  });
});
