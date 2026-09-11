/**
 * Gestion des limites du forfait Gratuit côté client.
 * - `checkLimit(feature, currentCount?)` : autorise ou non l'action (+ message d'upsell).
 * - `recordUsage(feature)` : incrémente le compteur des features à quota temporel.
 * En Premium, tout est toujours autorisé.
 *
 * Les quotas temporels (suggestions/jour, planner/semaine…) sont comptés en
 * local (AsyncStorage) avec réinitialisation par période. Les limites « count »
 * (cercle, passport, voyage) s'appuient sur un `currentCount` fourni par l'écran.
 *
 * Le compte admin n'est PLUS exempté d'office. Il l'était tant qu'il n'avait
 * aucun moyen de changer de forfait ; le sélecteur du tableau de bord lui en
 * donne un, et une exemption invisible empêcherait justement de vérifier ce
 * que voit un compte Gratuit. Un admin qui veut tout ouvert se met en Diamond,
 * où chaque limite vaut Infinity.
 *
 * Ces compteurs vivent sur l'APPAREIL : réinstaller l'app les remet à zéro.
 * C'est une limite de confort, pas une serrure — le jour où l'abonnement
 * rapportera de l'argent, ils devront être tenus par le serveur.
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Plan } from '@yumia/shared';
import { useAuth } from './auth-context';
import { useI18n } from './useI18n';
import {
  DISPLAY_CAPS_BY_PLAN,
  LIMITS_BY_PLAN,
  LIMIT_UNIT_KEYS,
  nextPaidPlan,
  LIMIT_MESSAGE_KEYS,
  LIMIT_PERIOD,
  type DisplayCap,
  type LimitedFeature,
  type PremiumOnlyFeature,
} from './constants/plan-limits';
import { PLAN_PRICE_EUR } from '@yumia/shared';

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

/**
 * Clé de stockage d'un compteur.
 *
 * La PORTÉE sépare des compteurs qui, sans elle, se confondraient : trois
 * itinéraires par jour « pour chaque mode » veut dire trois en Date ET trois
 * en Voyage, pas trois en tout. Même chose par univers pour la carte, les
 * rayons et la météo.
 */
function usageKey(feature: LimitedFeature, scope?: string): string {
  return scope ? `usage:${feature}:${scope}` : `usage:${feature}`;
}

async function readCount(
  feature: LimitedFeature,
  period: 'day' | 'week' | 'none',
  scope?: string,
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(usageKey(feature, scope));
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
  /** Le palier à proposer : celui juste au-dessus de l'actuel. */
  const upgradeTo = nextPaidPlan(planTier);
  const upgradePrice = upgradeTo
    ? `${PLAN_PRICE_EUR[upgradeTo].toFixed(2).replace('.', ',')} €`
    : '';

  /** Limite du palier ACTUEL pour une fonctionnalité (Diamond = Infinity). */
  const getLimit = useCallback(
    (feature: LimitedFeature): number => LIMITS_BY_PLAN[planTier][feature],
    [planTier],
  );

  const checkLimit = useCallback(
    async (feature: LimitedFeature, currentCount?: number, scope?: string): Promise<LimitCheck> => {
      const limit = getLimit(feature);
      const period = LIMIT_PERIOD[feature];
      const used = period === 'none' ? currentCount ?? 0 : await readCount(feature, period, scope);
      const allowed = used < limit;
      const message = allowed
        ? ''
        : t(LIMIT_MESSAGE_KEYS[feature]).replace('{price}', upgradePrice);
      return { allowed, message };
    },
    [getLimit, t, upgradePrice],
  );

  const recordUsage = useCallback(
    async (feature: LimitedFeature, scope?: string): Promise<void> => {
      const period = LIMIT_PERIOD[feature];
      if (period === 'none') return; // compté via currentCount, pas de compteur local
      const pk = periodKey(period);
      const used = await readCount(feature, period, scope);
      await AsyncStorage.setItem(usageKey(feature, scope), JSON.stringify({ pk, count: used + 1 }));
    },
    [],
  );

  /**
   * Ce qui reste du quota aujourd'hui.
   *
   * Nécessaire quand l'écran doit DOSER plutôt qu'ouvrir ou fermer : Tind ne
   * peut pas présenter quinze profils à qui il en reste trois.
   */
  const remaining = useCallback(
    async (feature: LimitedFeature, scope?: string): Promise<number> => {
      const limit = getLimit(feature);
      if (limit === Infinity) return Infinity;
      const period = LIMIT_PERIOD[feature];
      if (period === 'none') return limit;
      return Math.max(0, limit - (await readCount(feature, period, scope)));
    },
    [getLimit],
  );

  /**
   * Combien de lieux afficher au palier courant. Le serveur en renvoie plus :
   * on coupe à l'affichage, sans toucher au cache ni à la pagination.
   */
  const displayCap = useCallback(
    (cap: DisplayCap): number => DISPLAY_CAPS_BY_PLAN[planTier][cap],
    [planTier],
  );

  /**
   * Message d'une limite atteinte.
   *
   * Trois choses, dans cet ordre : le quota exact et ce qu'il compte, ce qui
   * reste ouvert, puis le prix. L'ancien texte commençait par proposer de
   * payer, ce qui présentait comme une porte fermée ce qui n'est qu'un
   * compteur du jour — et taisait le chiffre, seul renseignement vraiment
   * utile pour s'organiser.
   *
   * `othersOpen` distingue un quota compté PAR PORTÉE (un univers, un mode :
   * les autres restent disponibles) d'un quota global.
   */
  const quotaMessage = useCallback(
    (feature: LimitedFeature, scopeLabel: string, othersOpen = false): string => {
      const unitKey = LIMIT_UNIT_KEYS[feature];
      const head = t(othersOpen ? 'limit_quota_scoped' : 'limit_quota_global')
        .replace('{n}', String(getLimit(feature)))
        .replace('{unit}', unitKey ? t(unitKey) : '')
        .replace(/\{scope\}/g, scopeLabel);
      // Plus rien au-dessus (Diamond) : on n'invente pas une offre. Le cas ne
      // devrait pas se présenter — Diamond n'a aucune limite — mais un
      // message qui vend du vide serait pire qu'un message court.
      if (!upgradeTo) return head;
      return `${head} ${t('limit_quota_upsell').replace('{price}', upgradePrice)}`;
    },
    [getLimit, t, upgradeTo, upgradePrice],
  );

  /** Fonctionnalité fermée au forfait Gratuit (carte sociale). */
  const isFeatureLocked = useCallback(
    (_feature: PremiumOnlyFeature): boolean => planTier === 'free',
    [planTier],
  );

  const lockedMessage = useCallback(
    (): string => t('limit_premium_only').replace('{price}', upgradePrice),
    [t, upgradePrice],
  );

  return {
    planTier, upgradeTo, isPremium, isAdmin, getLimit, checkLimit, recordUsage, remaining,
    displayCap, isFeatureLocked, lockedMessage, quotaMessage,
  };
}
