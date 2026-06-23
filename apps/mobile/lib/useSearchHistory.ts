/**
 * Historique de recherche local (max 10 entrées, SecureStore).
 */
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const KEY = 'yumia_search_history';
const MAX = 10;

/**
 * Calcule l'historique après ajout d'une requête : trim, dédoublonnage
 * insensible à la casse (la nouvelle occurrence remonte en tête), plafond `max`.
 * Renvoie `prev` inchangé si la requête est vide après trim.
 * Logique pure et testable, extraite du hook.
 */
export function nextSearchHistory(prev: string[], query: string, max = MAX): string[] {
  const q = query.trim();
  if (!q) return prev;
  return [q, ...prev.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, max);
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => setHistory(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => {});
  }, []);

  const addToHistory = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setHistory((prev) => {
      const next = nextSearchHistory(prev, query);
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeFromHistory = useCallback(async (query: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h !== query);
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
  }, []);

  return {
    history,
    push: addToHistory,
    addToHistory,
    remove: removeFromHistory,
    removeFromHistory,
    clear: clearHistory,
    clearHistory,
  };
}
