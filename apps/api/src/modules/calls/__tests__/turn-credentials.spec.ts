import { createHmac } from 'crypto';
import { TURN_CREDENTIAL_TTL_SECONDS, turnCredentials } from '../turn-credentials';

describe('turnCredentials (TURN REST API coturn)', () => {
  it('nom = expiration:utilisateur, mot de passe = HMAC-SHA1 base64 du nom', () => {
    const now = 1_800_000_000_000;
    const c = turnCredentials('s3cret', ['turn:x:3478'], 'u1', now);
    const expiry = now / 1000 + TURN_CREDENTIAL_TTL_SECONDS;
    expect(c.username).toBe(`${expiry}:u1`);
    expect(c.credential).toBe(createHmac('sha1', 's3cret').update(`${expiry}:u1`).digest('base64'));
    expect(c.urls).toEqual(['turn:x:3478']);
  });
});
