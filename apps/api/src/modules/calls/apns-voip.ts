/**
 * Notifications VoIP (PushKit) envoyées directement à Apple — c'est ce qui
 * fait sonner un iPhone comme un vrai appel (CallKit), app fermée ou
 * téléphone verrouillé. Expo ne sait pas envoyer ce type de push.
 *
 * Authentification par jeton : un JWT ES256 signé avec la clé APNs (.p8),
 * renouvelé toutes les 50 min (Apple le refuse au-delà d'une heure).
 *
 * Configuration (toutes requises, sinon `enabled` est faux et l'appel
 * repasse par la notification Expo classique) :
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY (contenu du .p8, \n échappés ou base64),
 *   APNS_BUNDLE_ID (défaut com.yumia.app).
 *
 * Règle Apple : chaque push VoIP DOIT aboutir à un appel affiché par CallKit,
 * y compris l'annulation (voir YumiaCallsModule.swift). Ne jamais s'en
 * servir pour autre chose qu'un appel.
 */
import { createPrivateKey, sign, type KeyObject } from 'crypto';
import { connect, constants, type ClientHttp2Session } from 'http2';
import { Logger } from '@nestjs/common';

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;
type ApnsEnv = keyof typeof HOSTS;

export type VoipResult = 'ok' | 'invalid-token' | 'error';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Accepte le .p8 tel quel, avec des \n échappés (fichier .env), ou en base64. */
export function parseP8(raw: string): string {
  const text = raw.includes('BEGIN PRIVATE KEY') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return text.replace(/\\n/g, '\n').trim();
}

/** JWT ES256 du fournisseur APNs (signature brute r||s, pas DER). */
export function providerToken(key: KeyObject, keyId: string, teamId: string, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: nowSec }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(signature)}`;
}

export class ApnsVoip {
  private readonly logger = new Logger('ApnsVoip');
  private readonly key: KeyObject | null = null;
  private readonly keyId = process.env.APNS_KEY_ID || '';
  private readonly teamId = process.env.APNS_TEAM_ID || '';
  private readonly topic = `${process.env.APNS_BUNDLE_ID || 'com.yumia.app'}.voip`;
  private jwt: { token: string; at: number } | null = null;
  private readonly sessions = new Map<ApnsEnv, ClientHttp2Session>();

  constructor() {
    const raw = process.env.APNS_KEY || '';
    if (raw && this.keyId && this.teamId) {
      try {
        this.key = createPrivateKey(parseP8(raw));
      } catch (err) {
        this.logger.error('APNS_KEY illisible — appels iOS par notification classique', err as Error);
      }
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  private bearer(): string {
    const now = Math.floor(Date.now() / 1000);
    if (!this.jwt || now - this.jwt.at > 50 * 60) {
      this.jwt = { token: providerToken(this.key!, this.keyId, this.teamId, now), at: now };
    }
    return this.jwt.token;
  }

  private session(env: ApnsEnv): ClientHttp2Session {
    const existing = this.sessions.get(env);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const s = connect(HOSTS[env]);
    s.on('error', () => this.sessions.delete(env));
    s.on('close', () => this.sessions.delete(env));
    // Pas de connexion gardée ouverte pour rien entre deux appels.
    s.setTimeout(5 * 60_000, () => s.close());
    s.unref();
    this.sessions.set(env, s);
    return s;
  }

  private post(env: ApnsEnv, token: string, payload: object): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve) => {
      let req;
      try {
        req = this.session(env).request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
          authorization: `bearer ${this.bearer()}`,
          'apns-topic': this.topic,
          'apns-push-type': 'voip',
          'apns-priority': '10',
          // Un appel ne se rejoue pas plus tard : livré tout de suite ou jamais.
          'apns-expiration': '0',
          'content-type': 'application/json',
        });
      } catch {
        resolve({ status: 0 });
        return;
      }
      let status = 0;
      let body = '';
      req.setTimeout(10_000, () => req.close(constants.NGHTTP2_CANCEL));
      req.on('response', (headers) => { status = Number(headers[constants.HTTP2_HEADER_STATUS]) || 0; });
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let reason: string | undefined;
        try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { /* corps vide */ }
        resolve({ status, reason });
      });
      req.on('error', () => resolve({ status: 0 }));
      req.end(JSON.stringify(payload));
    });
  }

  /**
   * Envoie en production ; un jeton de build de développement est refusé
   * (BadDeviceToken) → nouvel essai sur le bac à sable.
   */
  async send(token: string, payload: object): Promise<VoipResult> {
    if (!this.key) return 'error';
    let res = await this.post('production', token, payload);
    if (res.status === 400 && res.reason === 'BadDeviceToken') {
      res = await this.post('sandbox', token, payload);
    }
    if (res.status === 200) return 'ok';
    if (res.status === 410 || res.reason === 'BadDeviceToken' || res.reason === 'Unregistered') {
      return 'invalid-token';
    }
    this.logger.warn(`APNs VoIP ${res.status} ${res.reason ?? ''}`);
    return 'error';
  }
}
