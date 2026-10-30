import { generateKeyPairSync, verify } from 'crypto';
import { declineToken, verifyDeclineToken } from '../call-token';
import { parseP8, providerToken } from '../apns-voip';

describe('jeton de refus', () => {
  beforeAll(() => { process.env.JWT_ACCESS_SECRET = 'test-secret'; });

  it('valide le jeton de son appel et de son destinataire seulement', () => {
    const t = declineToken('call-1', 'user-b');
    expect(verifyDeclineToken('call-1', 'user-b', t)).toBe(true);
    expect(verifyDeclineToken('call-2', 'user-b', t)).toBe(false);
    expect(verifyDeclineToken('call-1', 'user-c', t)).toBe(false);
    expect(verifyDeclineToken('call-1', 'user-b', '')).toBe(false);
  });
});

describe('APNs', () => {
  it('lit le .p8 avec des \n échappés ou en base64', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----';
    expect(parseP8(pem.replace(/\n/g, '\n'))).toBe(pem);
    expect(parseP8(Buffer.from(pem).toString('base64'))).toBe(pem);
  });

  it('signe un JWT ES256 vérifiable', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwt = providerToken(privateKey, 'KEY123', 'TEAM456', 1_700_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: 'TEAM456', iat: 1_700_000_000 });
    const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });
});
