// In-memory stub d'expo-secure-store pour les tests jest en environnement node.
// Reproduit le contrat setItemAsync/getItemAsync/deleteItemAsync, entrées
// séparées par `keychainService` comme le vrai Keychain.
const store = new Map();
const id = (k, opts) => `${(opts && opts.keychainService) || 'app'}:${k}`;

module.exports = {
  __esModule: true,
  AFTER_FIRST_UNLOCK: 0,
  WHEN_UNLOCKED: 5,
  setItemAsync: (k, v, opts) => {
    store.set(id(k, opts), String(v));
    return Promise.resolve();
  },
  getItemAsync: (k, opts) => Promise.resolve(store.has(id(k, opts)) ? store.get(id(k, opts)) : null),
  deleteItemAsync: (k, opts) => {
    store.delete(id(k, opts));
    return Promise.resolve();
  },
  // Helper de test (hors contrat) pour repartir d'un store vide.
  __reset: () => store.clear(),
};
