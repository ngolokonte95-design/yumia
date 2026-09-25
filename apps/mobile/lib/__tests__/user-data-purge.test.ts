import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { isUserScopedKey, purgeUserData } from '../user-data-purge';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const asMock = require('../../test/mocks/async-storage').default as { __reset: () => void };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ssMock = require('../../test/mocks/secure-store') as { __reset: () => void };

describe('purgeUserData', () => {
  beforeEach(() => {
    asMock.__reset();
    ssMock.__reset();
  });

  it('efface les données du compte et garde celles de l\'appareil', async () => {
    const userKeys = ['@yumia/cache/passport:me', '@yumia/cache/saved:ids', 'usage:suggestions', 'usage:itinerary:date', 'yumia:memories'];
    const deviceKeys = ['@yumia/tips-seen', '@yumia/device-locale', '@yumia/map_search_radius_km', 'yumia.aiConsent.v1.u1'];
    for (const k of [...userKeys, ...deviceKeys]) await AsyncStorage.setItem(k, 'x');
    await SecureStore.setItemAsync('yumia_search_history', '["a"]');
    await SecureStore.setItemAsync('yumia_e2e_priv_v1', 'k');

    await purgeUserData();

    for (const k of userKeys) expect(await AsyncStorage.getItem(k)).toBeNull();
    for (const k of deviceKeys) expect(await AsyncStorage.getItem(k)).toBe('x');
    expect(await SecureStore.getItemAsync('yumia_search_history')).toBeNull();
    expect(await SecureStore.getItemAsync('yumia_e2e_priv_v1')).toBe('k');
  });

  it('classe les clés', () => {
    expect(isUserScopedKey('@yumia/cache/feed:{}')).toBe(true);
    expect(isUserScopedKey('@yumia/tips-seen')).toBe(false);
  });
});
