// In-memory stub de @react-native-async-storage/async-storage pour les tests.
// Reproduit le contrat getItem/setItem/removeItem utilisé par lib/cache.ts.
const store = new Map();

module.exports = {
  __esModule: true,
  default: {
    getItem: (k) => Promise.resolve(store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
      return Promise.resolve();
    },
    removeItem: (k) => {
      store.delete(k);
      return Promise.resolve();
    },
    // Helper de test (hors contrat RN) pour repartir d'un cache vide.
    __reset: () => store.clear(),
  },
};
