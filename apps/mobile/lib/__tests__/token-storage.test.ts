import { saveTokens, loadTokens, clearTokens } from '../token-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SecureStore = require('../../test/mocks/secure-store') as {
  __reset: () => void;
  getItemAsync: (k: string, opts?: object) => Promise<string | null>;
  setItemAsync: (k: string, v: string, opts?: object) => Promise<void>;
};
const SESSION = { keychainService: 'yumia.session' };

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

      expect(await SecureStore.getItemAsync('yumia.accessToken', SESSION)).toBe('access-abc');
      expect(await SecureStore.getItemAsync('yumia.refreshToken', SESSION)).toBe('refresh-xyz');
    });
  });

  describe('loadTokens', () => {
    it('relit la paire de jetons écrite', async () => {
      await saveTokens(tokens);

      expect(await loadTokens()).toEqual({ accessToken: 'access-abc', refreshToken: 'refresh-xyz' });
    });

    it('reprend la session d\'une version précédente et la déplace', async () => {
      await SecureStore.setItemAsync('yumia.accessToken', 'old-access');
      await SecureStore.setItemAsync('yumia.refreshToken', 'old-refresh');

      expect(await loadTokens()).toEqual({ accessToken: 'old-access', refreshToken: 'old-refresh' });
      expect(await SecureStore.getItemAsync('yumia.accessToken', SESSION)).toBe('old-access');
      expect(await SecureStore.getItemAsync('yumia.accessToken')).toBeNull();
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
      expect(await SecureStore.getItemAsync('yumia.accessToken', SESSION)).toBeNull();
      expect(await SecureStore.getItemAsync('yumia.refreshToken', SESSION)).toBeNull();
    });
  });
});
