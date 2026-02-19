import * as bip39 from '@scure/bip39';
// @ts-ignore - subpath exports use .js extension
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
// @ts-ignore - subpath exports use .js extension
import { sha256 } from '@noble/hashes/sha2.js';
// @ts-ignore - subpath exports use .js extension
import { ripemd160 } from '@noble/hashes/legacy.js';
// @ts-ignore - subpath exports use .js extension
import { bytesToHex } from '@noble/hashes/utils.js';

const BIP44_BTC_PATH = "m/84'/0'/0'";

export interface DerivedWalletInfo {
  xpub: string;
  firstReceiveAddress: string;
  fingerprint: string;
}

export function generateMnemonic(strength: 12 | 24 = 12): string {
  const bits = strength === 12 ? 128 : 256;
  const mnemonic = bip39.generateMnemonic(wordlist, bits);
  console.log('[Bitcoin] Generated new mnemonic with', strength, 'words');
  return mnemonic;
}

export function validateMnemonic(mnemonic: string): boolean {
  const valid = bip39.validateMnemonic(mnemonic, wordlist);
  console.log('[Bitcoin] Mnemonic validation:', valid);
  return valid;
}

export function mnemonicToSeed(mnemonic: string, passphrase?: string): Uint8Array {
  console.log('[Bitcoin] Deriving seed from mnemonic...');
  return bip39.mnemonicToSeedSync(mnemonic, passphrase);
}

export function entropyToMnemonic(entropy: Uint8Array): string {
  return bip39.entropyToMnemonic(entropy, wordlist);
}

export { wordlist };

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const data = new Uint8Array(payload.length + 4);
  data.set(payload);
  data.set(checksum, payload.length);

  let num = BigInt('0x' + bytesToHex(data));
  let result = '';
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    result = BASE58_ALPHABET[Number(remainder)] + result;
  }

  for (const byte of payload) {
    if (byte === 0) {
      result = '1' + result;
    } else {
      break;
    }
  }

  return result;
}

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) {
        chk ^= GEN[i];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) >> 5);
  }
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) {
    ret.push(hrp.charCodeAt(i) & 31);
  }
  return ret;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const ret: number[] = [];
  for (let i = 0; i < 6; i++) {
    ret.push((polymod >> (5 * (5 - i))) & 31);
  }
  return ret;
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  }
  return ret;
}

function encodeBech32(hrp: string, witnessVersion: number, witnessProgram: Uint8Array): string {
  const fiveBitData = convertBits(witnessProgram, 8, 5, true);
  const data = [witnessVersion, ...fiveBitData];
  const checksum = bech32CreateChecksum(hrp, data);
  let result = hrp + '1';
  for (const d of data.concat(checksum)) {
    result += BECH32_CHARSET[d];
  }
  return result;
}

export function pubkeyToSegwitAddress(pubkey: Uint8Array, mainnet: boolean = true): string {
  const h160 = hash160(pubkey);
  const hrp = mainnet ? 'bc' : 'tb';
  return encodeBech32(hrp, 0, h160);
}

export function pubkeyToLegacyAddress(pubkey: Uint8Array, mainnet: boolean = true): string {
  const h160 = hash160(pubkey);
  const prefix = mainnet ? 0x00 : 0x6f;
  const payload = new Uint8Array(1 + h160.length);
  payload[0] = prefix;
  payload.set(h160, 1);
  return base58check(payload);
}

export function deriveWalletInfo(mnemonic: string, passphrase?: string): DerivedWalletInfo {
  console.log('[Bitcoin] Deriving wallet info from mnemonic...');
  const seed = mnemonicToSeed(mnemonic, passphrase);
  const master = HDKey.fromMasterSeed(seed);
  const account = master.derive(BIP44_BTC_PATH);

  const fp = master.fingerprint;
  const fingerprint = typeof fp === 'number'
    ? fp.toString(16).padStart(8, '0')
    : bytesToHex(fp as Uint8Array);

  const xpub = account.publicExtendedKey;

  const firstChild = account.deriveChild(0).deriveChild(0);
  const firstReceiveAddress = firstChild.publicKey
    ? pubkeyToSegwitAddress(firstChild.publicKey, true)
    : 'unknown';

  console.log('[Bitcoin] Derived wallet - fingerprint:', fingerprint);
  console.log('[Bitcoin] First receive address:', firstReceiveAddress);

  return {
    xpub,
    firstReceiveAddress,
    fingerprint,
  };
}

export function deriveReceiveAddresses(mnemonic: string, count: number = 5, passphrase?: string): string[] {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  const master = HDKey.fromMasterSeed(seed);
  const account = master.derive(BIP44_BTC_PATH);

  const addresses: string[] = [];
  for (let i = 0; i < count; i++) {
    const child = account.deriveChild(0).deriveChild(i);
    if (child.publicKey) {
      addresses.push(pubkeyToSegwitAddress(child.publicKey, true));
    }
  }
  console.log('[Bitcoin] Derived', addresses.length, 'receive addresses');
  return addresses;
}

export function shortenAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}
