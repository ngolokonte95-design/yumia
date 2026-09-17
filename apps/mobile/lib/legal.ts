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
