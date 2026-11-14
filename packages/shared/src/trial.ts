/**
 * Essai Gold offert à l'inscription (« essai inversé », 1.0.1).
 *
 * Tout nouveau compte a les limites de Gold pendant {@link TRIAL_DAYS}
 * jours, sans moyen de paiement, puis repasse en Gratuit s'il ne s'abonne
 * pas. Le forfait PAYÉ (`User.plan`) ne change jamais : l'essai se lit à
 * part, d'où {@link effectivePlan}. Les étoiles affichées aux autres membres
 * restent celles du forfait payé — un essai n'est pas un abonnement.
 *
 * Même règle des deux côtés : l'app (limites, écrans) et l'API (quotas).
 */
import type { Plan } from './gamification';

export const TRIAL_DAYS = 7;
export const TRIAL_PLAN: Exclude<Plan, 'free'> = 'gold';
/** Rappels quotidiens pendant les derniers jours de l'essai. */
export const TRIAL_REMINDER_DAYS = 3;

const DAY_MS = 86_400_000;

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
}

/** L'essai court-il encore ? Un abonné payant n'est jamais « en essai ». */
export function isOnTrial(plan: Plan, trialEndsAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (plan !== 'free' || !trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > now;
}

/** Forfait qui donne les droits : le payé, sinon l'essai en cours, sinon Gratuit. */
export function effectivePlan(plan: Plan, trialEndsAt: Date | string | null | undefined, now = Date.now()): Plan {
  return isOnTrial(plan, trialEndsAt, now) ? TRIAL_PLAN : plan;
}

/** Jours d'essai restants, arrondis au jour supérieur (0 quand fini). */
export function trialDaysLeft(trialEndsAt: Date | string | null | undefined, now = Date.now()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now) / DAY_MS));
}
