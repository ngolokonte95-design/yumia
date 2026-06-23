/**
 * Demande un avis App Store / Google Play après la 3ème visite de lieu.
 * Se déclenche une seule fois par installation.
 */
import { useCallback } from 'react';
import * as StoreReview from 'expo-store-review';
import * as SecureStore from 'expo-secure-store';

const COUNT_KEY = 'yumia_visit_count_for_review';
const ASKED_KEY = 'yumia_review_asked';
const THRESHOLD = 3;

export function useStoreReview() {
  const onVisitRecorded = useCallback(async () => {
    try {
      const already = await SecureStore.getItemAsync(ASKED_KEY);
      if (already) return;

      const raw = await SecureStore.getItemAsync(COUNT_KEY);
      const count = parseInt(raw ?? '0', 10) + 1;
      await SecureStore.setItemAsync(COUNT_KEY, String(count));

      if (count < THRESHOLD) return;

      const available = await StoreReview.isAvailableAsync();
      if (!available) return;

      await SecureStore.setItemAsync(ASKED_KEY, '1');
      setTimeout(() => { void StoreReview.requestReview(); }, 1500);
    } catch {/* silencieux — ne jamais crasher pour ça */}
  }, []);

  return { onVisitRecorded };
}
