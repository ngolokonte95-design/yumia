// In-memory stub d'expo-secure-store pour les tests jest en environnement node.
// Reproduit le contrat setItemAsync/getItemAsync/deleteItemAsync.
const store = new Map();

module.exports = {
  __esModule: true,
  setItemAsync: (k, v) => {
    store.set(k, String(v));
    return Promise.resolve();
  },
  getItemAsync: (k) => Promise.resolve(store.has(k) ? store.get(k) : null),
  deleteItemAsync: (k) => {
    store.delete(k);
    return Promise.resolve();
  },
  // Helper de test (hors contrat) pour repartir d'un store vide.
  __reset: () => store.clear(),
};
