// Chiffrement E2E AES-GCM-256 + ECDH secp256k1 pour messages MeshCore
// @ts-ignore
import { gcm } from '@noble/ciphers/aes';
// @ts-ignore
import { randomBytes } from '@noble/ciphers/webcrypto';
import { secp256k1 } from '@noble/curves/secp256k1';
// @ts-ignore
import { sha256 } from '@noble/hashes/sha2.js';
// @ts-ignore
import { bytesToHex } from '@noble/hashes/utils.js';

// hexToBytes — implémentation locale (noble/hashes ne l'exporte pas toujours)
function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface EncryptedPayload {
  v: number;
  nonce: string;  // base64 12 bytes
  ct: string;     // base64 ciphertext + tag GCM
}

// --- Utilitaires base64 ---
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

// --- ECDH: dériver clé partagée entre deux parties ---
// maPrivKey (32 bytes) × leurPubKey (33 bytes) → secret 32 bytes
export function deriveSharedSecret(
  myPrivkeyBytes: Uint8Array,
  theirPubkeyHex: string
): Uint8Array {
  const theirPubkey = hexToBytes(theirPubkeyHex);
  // ECDH: point = privKey * pubKey, on prend les 32 bytes X de ce point
  const sharedPoint = secp256k1.getSharedSecret(myPrivkeyBytes, theirPubkey, true);
  // sharedPoint est 33 bytes (compressed), on hash pour obtenir la clé AES
  return sha256(sharedPoint);
}

// --- Clé symétrique pour forum public ---
// channelName ex: "bitcoin-paris" → SHA256("forum:bitcoin-paris")
export function deriveForumKey(channelName: string): Uint8Array {
  const encoder = new TextEncoder();
  return sha256(encoder.encode('forum:' + channelName));
}

// --- Chiffrement AES-GCM-256 ---
export function encryptMessage(plaintext: string, key: Uint8Array): EncryptedPayload {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const nonce = randomBytes(12);
  const cipher = gcm(key, nonce);
  const ciphertext = cipher.encrypt(data);

  return {
    v: 1,
    nonce: toBase64(nonce),
    ct: toBase64(ciphertext),
  };
}

// --- Déchiffrement AES-GCM-256 ---
export function decryptMessage(payload: EncryptedPayload, key: Uint8Array): string {
  const nonce = fromBase64(payload.nonce);
  const ciphertext = fromBase64(payload.ct);
  const cipher = gcm(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

// --- Chiffrer un DM pour un destinataire ---
export function encryptDM(
  plaintext: string,
  myPrivkeyBytes: Uint8Array,
  theirPubkeyHex: string
): EncryptedPayload {
  const sharedKey = deriveSharedSecret(myPrivkeyBytes, theirPubkeyHex);
  return encryptMessage(plaintext, sharedKey);
}

// --- Déchiffrer un DM reçu ---
export function decryptDM(
  payload: EncryptedPayload,
  myPrivkeyBytes: Uint8Array,
  senderPubkeyHex: string
): string {
  const sharedKey = deriveSharedSecret(myPrivkeyBytes, senderPubkeyHex);
  return decryptMessage(payload, sharedKey);
}

// --- Chiffrer un message forum ---
export function encryptForum(plaintext: string, channelName: string): EncryptedPayload {
  const key = deriveForumKey(channelName);
  return encryptMessage(plaintext, key);
}

// --- Déchiffrer un message forum ---
export function decryptForum(payload: EncryptedPayload, channelName: string): string {
  const key = deriveForumKey(channelName);
  return decryptMessage(payload, key);
}

// Exporter bytesToHex pour usage externe
export { bytesToHex };
export { hexToBytes };
