/**
 * Système de gamification YUMIA (section 9 du PRD) : XP, niveaux, badges, streaks.
 * Source unique de vérité partagée entre backend (calcul) et mobile (affichage).
 */
export declare const XP_ACTIONS: readonly ["visit_place", "leave_rating", "share_place", "maintain_streak_7", "visit_new_country", "try_new_universe", "invite_friend_joined", "complete_weekly_challenge"];
export type XpAction = (typeof XP_ACTIONS)[number];
export interface XpRule {
    action: XpAction;
    xp: number;
    /** Plafond de fréquence ; null = illimité. */
    maxPerDay: number | null;
}
export declare const XP_RULES: Record<XpAction, XpRule>;
export interface Level {
    level: number;
    emoji: string;
    titleFr: string;
    xpRequired: number;
}
export declare const LEVELS: Level[];
/** Renvoie le niveau atteint pour un total d'XP donné. */
export declare function levelForXp(totalXp: number): Level;
export declare const BADGES: readonly ["early_bird", "night_owl", "globe_trotter", "sushi_master", "romantic", "super_parent", "on_fire", "adventurer", "influencer", "local_expert", "frequent_flyer", "social_star"];
export type Badge = (typeof BADGES)[number];
export interface BadgeMeta {
    key: Badge;
    emoji: string;
    nameFr: string;
    conditionFr: string;
}
export declare const BADGE_META: Record<Badge, BadgeMeta>;
export declare const PLANS: readonly ["free", "plus"];
export type Plan = (typeof PLANS)[number];
/** Limites Freemium (section 12 du PRD). Free = 85-90% des fonctionnalités. */
export declare const PLAN_LIMITS: {
    readonly free: {
        readonly savedPlacesMax: 50;
        readonly simultaneousFilters: 3;
        readonly streakFreezePerMonth: 0;
        readonly travelItineraryDays: 3;
    };
    readonly plus: {
        readonly savedPlacesMax: number;
        readonly simultaneousFilters: number;
        readonly streakFreezePerMonth: 2;
        readonly travelItineraryDays: 7;
    };
};
export declare const PLUS_PRICE_EUR = 2.99;
