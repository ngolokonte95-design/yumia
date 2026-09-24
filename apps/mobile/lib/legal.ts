/**
 * Liens vers les documents légaux, servis en statique par nginx depuis
 * /var/www/yumia (règle `try_files $uri.html`, donc /privacy → privacy.html).
 *
 * Apple et Google vérifient ces deux liens pendant la revue : ils doivent
 * rester accessibles publiquement, sans authentification.
 */
export const PRIVACY_URL = 'https://yumia.eu/privacy';
export const TERMS_URL = 'https://yumia.eu/terms';
/** Conditions générales de vente : à proposer avant tout paiement en boutique. */
export const CGV_URL = 'https://yumia.eu/cgv';
/** Aide et contact (FAQ, formulaire, adresse de support). */
export const SUPPORT_URL = 'https://yumia.eu/support';
/** Procédure de suppression du compte, accessible sans être connecté (exigence Google Play). */
export const DELETE_ACCOUNT_URL = 'https://yumia.eu/delete-account';
/** Gestion des abonnements dans les boutiques — repli quand la feuille native n'est pas disponible. */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
export const GOOGLE_MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
