/**
 * Identifiants TURN temporaires (« TURN REST API » de coturn).
 *
 * Avant, l'app embarquait un identifiant TURN fixe (eas.json/app.json, dépôt
 * public) : n'importe qui pouvait s'en servir comme relais gratuit. Ici
 * l'identifiant expire (6 h) et le mot de passe est un HMAC-SHA1 du nom
 * d'utilisateur avec un secret partagé avec coturn (`static-auth-secret`).
 * coturn le vérifie seul, sans base d'utilisateurs.
 */
import { createHmac } from 'crypto';

export const TURN_CREDENTIAL_TTL_SECONDS = 6 * 3600;

export interface IceServer { urls: string | string[]; username?: string; credential?: string }

export function turnCredentials(
  secret: string,
  urls: string[],
  userId: string,
  now = Date.now(),
): IceServer {
  const expiry = Math.floor(now / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiry}:${userId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { urls, username, credential };
}
