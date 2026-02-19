// Identité MeshCore dérivée du seed Bitcoin (BIP32 m/69'/0'/0'/0)
import { HDKey } from '@scure/bip32';
// @ts-ignore
import { sha256 } from '@noble/hashes/sha2.js';
// @ts-ignore
import { bytesToHex } from '@noble/hashes/utils.js';
import { mnemonicToSeed } from '@/utils/bitcoin';

// Chemin de dérivation dédié à la messagerie MeshCore
const MESHCORE_PATH = "m/69'/0'/0'/0";

export interface MeshIdentity {
  nodeId: string;       // ex: "MESH-A7F2"
  displayName: string | null;  // Nom personnalisable affiché dans les chats
  pubkeyHex: string;    // clé publique compressée 33 bytes hex
  privkeyHex: string;   // clé privée 32 bytes hex (ne jamais exposer en UI)
  pubkeyBytes: Uint8Array;
  privkeyBytes: Uint8Array;
}

// Dériver l'identité MeshCore depuis la phrase mnémonic du wallet
export function deriveMeshIdentity(mnemonic: string, passphrase?: string): MeshIdentity {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(MESHCORE_PATH);

  if (!child.publicKey || !child.privateKey) {
    throw new Error('[Identity] Échec dérivation clés MeshCore');
  }

  const pubkeyBytes = child.publicKey;
  const privkeyBytes = child.privateKey;

  // NodeId = "MESH-" + 4 premiers octets du SHA256(pubkey) en majuscules
  const hash = sha256(pubkeyBytes);
  const nodeId = 'MESH-' + bytesToHex(hash).slice(0, 8).toUpperCase();

  console.log('[Identity] NodeId dérivé:', nodeId);

  return {
    nodeId,
    displayName: null, // Sera chargé depuis la DB
    pubkeyHex: bytesToHex(pubkeyBytes),
    privkeyHex: bytesToHex(privkeyBytes),
    pubkeyBytes,
    privkeyBytes,
  };
}

// Convertir un hex pubkey en Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
