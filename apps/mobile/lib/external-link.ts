/**
 * Ouverture des liens externes venus du serveur (réservation, affiliés,
 * paiement, suivi de colis, crédit photo…).
 *
 * Seuls les liens `https://` sont ouverts : une URL renvoyée par l'API (ou
 * par un partenaire relayé par l'API) ne doit jamais pouvoir déclencher un
 * autre schéma — `tel:`, `sms:`, `intent:`, un deep link d'une autre app, ni
 * même `http://` en clair. Les liens `mailto:` / `tel:` voulus par l'app
 * (constantes locales) n'ont pas à passer par ici.
 */
import { Linking } from 'react-native';

/** Vrai si `url` est une chaîne https:// bien formée (hôte non vide). */
export function isHttpsUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!/^https:\/\/[^\s/?#]+/i.test(trimmed)) return false;
  return !/\s/.test(trimmed);
}

/**
 * Ouvre `url` dans le navigateur / l'app associée si et seulement si c'est un
 * lien https://. Renvoie `false` (sans rien ouvrir) sinon. Une erreur de
 * `Linking.openURL` est propagée telle quelle à l'appelant.
 */
export async function openExternalHttps(url: unknown): Promise<boolean> {
  if (!isHttpsUrl(url)) return false;
  await Linking.openURL(url.trim());
  return true;
}
