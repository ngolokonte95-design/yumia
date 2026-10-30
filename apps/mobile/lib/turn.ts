/**
 * Serveurs ICE d'un appel : STUN public + relais TURN.
 *
 * Le TURN est demandé à l'API juste avant l'appel, avec un identifiant
 * temporaire (6 h). Repli sur l'identifiant fixe du build tant que le
 * serveur n'a pas activé le mode « use-auth-secret » de coturn — ou si la
 * requête échoue : un appel sans relais coupe souvent en 4G/5G.
 */
import { API_BASE_URL, TURN_SERVER } from './config';

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function staticTurn(): IceServer[] {
  return TURN_SERVER.url
    ? [{ urls: TURN_SERVER.url, username: TURN_SERVER.username, credential: TURN_SERVER.credential }]
    : [];
}

export async function fetchIceServers(accessToken: string | null | undefined): Promise<IceServer[]> {
  if (accessToken) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_BASE_URL}/calls/turn-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: IceServer[] };
        if (data.iceServers?.length) return [...STUN, ...data.iceServers];
      }
    } catch { /* repli ci-dessous */ }
  }
  return [...STUN, ...staticTurn()];
}
