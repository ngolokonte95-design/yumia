/**
 * Gestion des limites du forfait Gratuit côté client.
 * - `checkLimit(feature, currentCount?)` : autorise ou non l'action (+ message d'upsell).
 * - `recordUsage(feature)` : incrémente le compteur des features à quota temporel.
 * En Premium, tout est toujours autorisé.
 *
 * Les quotas temporels (suggestions/jour, planner/semaine…) sont comptés en
 * local (AsyncStorage) avec réinitialisation par période. Les limites « count »
 * (cercle, passport, voyage) s'appuient sur un `currentCount` fourni par l'écran.
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Plan } from '@yumia/shared';
import { useAuth } from './auth-context';
import { useI18n } from './useI18n';
import {
  LIMITS_BY_PLAN,
  LIMIT_MESSAGE_KEYS,
  LIMIT_PERIOD,
  type LimitedFeature,
} from './constants/plan-limits';
import { PLUS_PRICE_EUR } from '@yumia/shared';

export interface LimitCheck {
  allowed: boolean;
  message: string;
}

function periodKey(period: 'day' | 'week' | 'none'): string {
  const now = new Date();
  if (period === 'day') return now.toISOString().slice(0, 10); // YYYY-MM-DD
  if (period === 'week') {
    // Numéro de semaine ISO (lundi → dimanche).
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week =
      1 +
      Math.round(
        (d.getTime() - firstThursday.getTime()) / 86_400_000 / 7,
      );
    return `${d.getUTCFullYear()}-W${week}`;
  }
  return 'none';
}

async function readCount(feature: LimitedFeature, period: 'day' | 'week' | 'none'): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`usage:${feature}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { pk: string; count: number };
    return parsed.pk === periodKey(period) ? parsed.count : 0;
  } catch {
    return 0;
  }
}

export function usePlanLimits() {
  const { user } = useAuth();
  const { t } = useI18n();
  // `isPremium` legacy conservé en repli tant que tous les comptes n'ont pas
  // encore de `plan` explicite (anciens utilisateurs Plus déjà marqués
  // isPremium avant l'ajout des paliers) — mappé sur 'plus' dans ce cas.
  const planTier: Plan = (user?.plan as Plan | undefined)
    ?? (user?.isPremium ? 'plus' : 'free');
  const isPremium = planTier !== 'free';
  const isAdmin = user?.isAdmin === true;

  /** Limite du palier ACTUEL pour une fonctionnalité (Diamond = Infinity). */
  const getLimit = useCallback(
    (feature: LimitedFeature): number => LIMITS_BY_PLAN[planTier][feature],
    [planTier],
  );

  const checkLimit = useCallback(
    async (feature: LimitedFeature, currentCount?: number): Promise<LimitCheck> => {
      if (isAdmin) return { allowed: true, message: '' };
      const limit = getLimit(feature);
      const period = LIMIT_PERIOD[feature];
      const used = period === 'none' ? currentCount ?? 0 : await readCount(feature, period);
      const allowed = used < limit;
      const message = allowed
        ? ''
        : t(LIMIT_MESSAGE_KEYS[feature]).replace('{price}', `${PLUS_PRICE_EUR.toFixed(2)}€`);
      return { allowed, message };
    },
    [isAdmin, getLimit, t],
  );

  const recordUsage = useCallback(
    async (feature: LimitedFeature): Promise<void> => {
      if (isAdmin) return;
      const period = LIMIT_PERIOD[feature];
      if (period === 'none') return; // compté via currentCount, pas de compteur local
      const pk = periodKey(period);
      const used = await readCount(feature, period);
      await AsyncStorage.setItem(`usage:${feature}`, JSON.stringify({ pk, count: used + 1 }));
    },
    [isAdmin],
  );

  return { planTier, isPremium, isAdmin, getLimit, checkLimit, recordUsage };
}
