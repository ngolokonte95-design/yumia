/**
 * Chiffrement E2E bout-en-bout — ECDH P-256 + AES-256-GCM
 * Niveau de sécurité : équivalent Signal Protocol (sans Double Ratchet).
 *
 * Flux :
 *  1. Chaque utilisateur génère une paire ECDH à l'installation (stockée dans SecureStore).
 *  2. La clé publique est envoyée au backend pour être accessible aux contacts.
 *  3. Avant d'envoyer un message, on dérive une clé symétrique commune via ECDH.
 *  4. On chiffre avec AES-256-GCM (IV aléatoire de 12 octets, tag d'authentification intégré).
 *  5. Le destinataire déchiffre en dérivant la même clé avec sa clé privée + clé publique expéditeur.
 */

import * as SecureStore from 'expo-secure-store';

const PRIV_KEY = 'yumia_e2e_priv_v1';
const PUB_KEY  = 'yumia_e2e_pub_v1';

// ── Utilitaires ───────────────────────────────────────────────────────────────
function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer as ArrayBuffer;
}
function fromBase64Uint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto API non disponible sur cet appareil.');
  return subtle;
}

// ── Génération de la paire de clés ────────────────────────────────────────────
async function generateAndStore(): Promise<{ publicKeyB64: string }> {
  const subtle = getSubtle();
  const pair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  const privRaw = await subtle.exportKey('pkcs8', pair.privateKey);
  const pubRaw  = await subtle.exportKey('raw',   pair.publicKey);

  await SecureStore.setItemAsync(PRIV_KEY, toBase64(privRaw));
  await SecureStore.setItemAsync(PUB_KEY,  toBase64(pubRaw));

  return { publicKeyB64: toBase64(pubRaw) };
}

/** Retourne la clé publique locale (en base64) — la génère si nécessaire. */
export async function getLocalPublicKey(): Promise<string> {
  const stored = await SecureStore.getItemAsync(PUB_KEY);
  if (stored) return stored;
  const { publicKeyB64 } = await generateAndStore();
  return publicKeyB64;
}

/** Exporte la clé privée locale en CryptoKey. */
async function getPrivateCryptoKey(): Promise<CryptoKey> {
  const subtle = getSubtle();
  const privB64 = await SecureStore.getItemAsync(PRIV_KEY);
  if (!privB64) {
    await generateAndStore();
    return getPrivateCryptoKey();
  }
  return subtle.importKey(
    'pkcs8', fromBase64(privB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );
}

/** Dérive la clé AES-256-GCM partagée entre deux utilisateurs via ECDH. */
async function deriveSharedKey(remotePublicKeyB64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const privKey = await getPrivateCryptoKey();
  const remotePub = await subtle.importKey(
    'raw', fromBase64(remotePublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return subtle.deriveKey(
    { name: 'ECDH', public: remotePub },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Chiffrement ───────────────────────────────────────────────────────────────
/**
 * Chiffre `plaintext` avec la clé publique du destinataire.
 * Retourne une chaîne base64 contenant : [IV 12 octets] + [ciphertext + GCM tag].
 */
export async function encryptMessage(plaintext: string, recipientPublicKeyB64: string): Promise<string> {
  const subtle = getSubtle();
  const sharedKey = await deriveSharedKey(recipientPublicKeyB64);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);

  const combined = new Uint8Array(12 + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), 12);
  return toBase64(combined);
}

/**
 * Déchiffre un message reçu en utilisant la clé publique de l'expéditeur.
 * Lève une erreur si le message a été altéré (GCM intègre l'authentification).
 */
export async function decryptMessage(ciphertextB64: string, senderPublicKeyB64: string): Promise<string> {
  const subtle = getSubtle();
  const sharedKey = await deriveSharedKey(senderPublicKeyB64);
  const combined = fromBase64Uint8(ciphertextB64);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, cipher);
  return new TextDecoder().decode(plain);
}

/**
 * Vérifie si Web Crypto est disponible sur cet appareil.
 * Retourne false si le moteur JS est trop ancien (JSC sans SubtleCrypto).
 */
export function isE2EAvailable(): boolean {
  return !!(globalThis.crypto?.subtle);
}
