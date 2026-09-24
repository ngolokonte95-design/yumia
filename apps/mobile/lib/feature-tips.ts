/**
 * Astuces de première utilisation : quelles fonctionnalités l'utilisateur a
 * déjà découvertes sur cet appareil.
 *
 * Stockées localement (AsyncStorage), pas sur le compte : une astuce explique
 * un écran, pas une préférence — la revoir en changeant de téléphone n'a rien
 * de gênant. « Revoir les astuces » (Réglages) efface la liste.
 */
import type { TranslationKey } from './translations';

let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = null;
}

const KEY = '@yumia/tips-seen';

export type FeatureTipId =
  | 'home' | 'map' | 'explorer' | 'social' | 'foryou' | 'passport' | 'reels' | 'chatbot'
  | 'itinerary' | 'chat' | 'shop' | 'tours' | 'place' | 'world_map' | 'post_create';

export const FEATURE_TIPS: Record<FeatureTipId, { emoji: string; title: TranslationKey; body: TranslationKey }> = {
  home: { emoji: '🏠', title: 'tip_home_title', body: 'tip_home_body' },
  map: { emoji: '🗺️', title: 'tip_map_title', body: 'tip_map_body' },
  explorer: { emoji: '🧭', title: 'tip_explorer_title', body: 'tip_explorer_body' },
  social: { emoji: '👥', title: 'tip_social_title', body: 'tip_social_body' },
  foryou: { emoji: '✨', title: 'tip_foryou_title', body: 'tip_foryou_body' },
  passport: { emoji: '🎒', title: 'tip_passport_title', body: 'tip_passport_body' },
  reels: { emoji: '🎬', title: 'tip_reels_title', body: 'tip_reels_body' },
  chatbot: { emoji: '🤖', title: 'tip_chatbot_title', body: 'tip_chatbot_body' },
  itinerary: { emoji: '🗓️', title: 'tip_itinerary_title', body: 'tip_itinerary_body' },
  chat: { emoji: '💬', title: 'tip_chat_title', body: 'tip_chat_body' },
  shop: { emoji: '🏬', title: 'tip_shop_title', body: 'tip_shop_body' },
  tours: { emoji: '🎟️', title: 'tip_tours_title', body: 'tip_tours_body' },
  place: { emoji: '📍', title: 'tip_place_title', body: 'tip_place_body' },
  world_map: { emoji: '🌍', title: 'tip_world_map_title', body: 'tip_world_map_body' },
  post_create: { emoji: '📸', title: 'tip_post_create_title', body: 'tip_post_create_body' },
};

let seen: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

async function load(): Promise<Set<string>> {
  if (seen) return seen;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = AsyncStorage ? await AsyncStorage.getItem(KEY) : null;
        seen = new Set(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        seen = new Set();
      }
      return seen;
    })();
  }
  return loading;
}

export async function hasSeenTip(id: FeatureTipId): Promise<boolean> {
  return (await load()).has(id);
}

export async function markTipSeen(id: FeatureTipId): Promise<void> {
  const s = await load();
  s.add(id);
  try {
    await AsyncStorage?.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // Stockage indisponible : l'astuce reviendra, rien de grave.
  }
}

/** Réglages → « Revoir les astuces ». */
export async function resetTips(): Promise<void> {
  seen = new Set();
  loading = null;
  try {
    await AsyncStorage?.removeItem(KEY);
  } catch {
    // idem
  }
}

/**
 * Une seule astuce à l'écran à la fois : deux écrans montés ensemble (onglets
 * voisins, écran empilé) n'en afficheront jamais deux superposées.
 */
let active: FeatureTipId | null = null;
export function claimTipSlot(id: FeatureTipId): boolean {
  if (active && active !== id) return false;
  active = id;
  return true;
}
export function releaseTipSlot(id: FeatureTipId): void {
  if (active === id) active = null;
}
