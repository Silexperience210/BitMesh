/**
 * MeshCore Protocol Implementation
 *
 * Protocole officiel MeshCore pour communication BLE + LoRa
 * Compatible avec firmware MeshCore Companion
 */

// UUIDs BLE MeshCore (Nordic UART Service standard)
export const MESHCORE_BLE = {
  SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  TX_CHAR_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Mobile → Device
  RX_CHAR_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Device → Mobile
} as const;

// Types de messages MeshCore
export enum MeshCoreMessageType {
  TEXT = 0x01,           // Message texte
  POSITION = 0x02,       // Position GPS
  KEY_ANNOUNCE = 0x03,   // Annonce de clé publique
  ACK = 0x04,            // Acknowledgement
  PING = 0x05,           // Ping/keepalive
  ROUTE_REQUEST = 0x06,  // Demande de route
  ROUTE_REPLY = 0x07,    // Réponse de route
}

// Flags de message
export enum MeshCoreFlags {
  ENCRYPTED = 0x01,      // Message chiffré
  SIGNED = 0x02,         // Message signé
  RELAY = 0x04,          // Relay requis (multi-hop)
  BROADCAST = 0x08,      // Broadcast à tous
  COMPRESSED = 0x10,     // Payload compressé avec Smaz
}

/**
 * Format de paquet MeshCore (binaire)
 *
 * Structure :
 * [0]      : Version (1 byte) = 0x01
 * [1]      : Type (1 byte) = MeshCoreMessageType
 * [2]      : Flags (1 byte) = MeshCoreFlags
 * [3]      : TTL (1 byte) = Time-to-live (0-255)
 * [4-7]    : Message ID (4 bytes) = uint32
 * [8-15]   : From Node ID (8 bytes) = uint64
 * [16-23]  : To Node ID (8 bytes) = uint64
 * [24-27]  : Timestamp (4 bytes) = unix timestamp (secondes)
 * [28-29]  : Payload length (2 bytes) = uint16
 * [30-N]   : Payload (variable)
 * [N+1-N+2]: Checksum (2 bytes) = CRC16
 */

export interface MeshCorePacket {
  version: number;
  type: MeshCoreMessageType;
  flags: number;
  ttl: number;
  messageId: number;
  fromNodeId: bigint;
  toNodeId: bigint;
  timestamp: number;
  payload: Uint8Array;
}

/**
 * Encoder un message en paquet binaire MeshCore
 */
export function encodeMeshCorePacket(packet: MeshCorePacket): Uint8Array {
  const payloadLen = packet.payload.length;
  const totalLen = 30 + payloadLen + 2; // Header (30) + Payload + CRC (2)
  const buffer = new Uint8Array(totalLen);
  const view = new DataView(buffer.buffer);

  let offset = 0;

  // Header
  buffer[offset++] = packet.version;
  buffer[offset++] = packet.type;
  buffer[offset++] = packet.flags;
  buffer[offset++] = packet.ttl;

  // Message ID (4 bytes, big endian)
  view.setUint32(offset, packet.messageId, false);
  offset += 4;

  // From Node ID (8 bytes, big endian)
  view.setBigUint64(offset, packet.fromNodeId, false);
  offset += 8;

  // To Node ID (8 bytes, big endian)
  view.setBigUint64(offset, packet.toNodeId, false);
  offset += 8;

  // Timestamp (4 bytes, big endian)
  view.setUint32(offset, packet.timestamp, false);
  offset += 4;

  // Payload length (2 bytes, big endian)
  view.setUint16(offset, payloadLen, false);
  offset += 2;

  // Payload
  buffer.set(packet.payload, offset);
  offset += payloadLen;

  // CRC16 (calculé sur tout sauf CRC lui-même)
  const crc = calculateCRC16(buffer.slice(0, offset));
  view.setUint16(offset, crc, false);

  return buffer;
}

/**
 * Décoder un paquet binaire MeshCore
 */
export function decodeMeshCorePacket(data: Uint8Array): MeshCorePacket | null {
  if (data.length < 32) {
    console.error('[MeshCore] Paquet trop court:', data.length);
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  try {
    // Header
    const version = data[offset++];
    const type = data[offset++] as MeshCoreMessageType;
    const flags = data[offset++];
    const ttl = data[offset++];

    // Message ID
    const messageId = view.getUint32(offset, false);
    offset += 4;

    // From Node ID
    const fromNodeId = view.getBigUint64(offset, false);
    offset += 8;

    // To Node ID
    const toNodeId = view.getBigUint64(offset, false);
    offset += 8;

    // Timestamp
    const timestamp = view.getUint32(offset, false);
    offset += 4;

    // Payload length
    const payloadLen = view.getUint16(offset, false);
    offset += 2;

    // Payload
    if (offset + payloadLen + 2 > data.length) {
      console.error('[MeshCore] Payload length invalide');
      return null;
    }

    const payload = data.slice(offset, offset + payloadLen);
    offset += payloadLen;

    // CRC16
    const receivedCRC = view.getUint16(offset, false);
    const calculatedCRC = calculateCRC16(data.slice(0, offset));

    if (receivedCRC !== calculatedCRC) {
      console.error('[MeshCore] CRC invalide');
      return null;
    }

    return {
      version,
      type,
      flags,
      ttl,
      messageId,
      fromNodeId,
      toNodeId,
      timestamp,
      payload,
    };
  } catch (err) {
    console.error('[MeshCore] Erreur décodage:', err);
    return null;
  }
}

/**
 * Convertir string nodeId → uint64
 * Ex: "MESH-A7F2" → 0xA7F2000000000000
 */
export function nodeIdToUint64(nodeId: string): bigint {
  // Extraire la partie hex après "MESH-"
  const hex = nodeId.replace('MESH-', '').padEnd(16, '0');
  return BigInt('0x' + hex);
}

/**
 * Convertir uint64 → string nodeId
 * Ex: 0xA7F2000000000000 → "MESH-A7F2"
 */
export function uint64ToNodeId(value: bigint): string {
  const hex = value.toString(16).padStart(16, '0').slice(0, 8);
  return 'MESH-' + hex.toUpperCase();
}

import { getNextMessageId } from './database';
import { compressWithFallback, isCompressed } from './compression';

/**
 * Créer un message texte MeshCore
 * Utilise un ID unique persistant et la compression si avantageuse
 */
export async function createTextMessage(
  fromNodeId: string,
  toNodeId: string,
  text: string,
  encrypted: boolean = false,
  useCompression: boolean = true
): Promise<MeshCorePacket> {
  let payload: Uint8Array;
  let flags = 0;

  // Compression si activée et avantageuse
  if (useCompression && !encrypted) {
    const compressed = compressWithFallback(text);
    payload = compressed.data;
    if (compressed.compressed) {
      flags |= MeshCoreFlags.COMPRESSED;
    }
  } else {
    const encoder = new TextEncoder();
    payload = encoder.encode(text);
  }

  if (encrypted) flags |= MeshCoreFlags.ENCRYPTED;

  // ID unique persistant (pas de collision)
  const messageId = await getNextMessageId();

  return {
    version: 0x01,
    type: MeshCoreMessageType.TEXT,
    flags,
    ttl: 10,
    messageId,
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: nodeIdToUint64(toNodeId),
    timestamp: Math.floor(Date.now() / 1000),
    payload,
  };
}

/**
 * Créer un message texte synchrone (sans DB) - pour compatibilité
 * Utilise un compteur basé sur le timestamp (moins robuste mais synchrone)
 */
export function createTextMessageSync(
  fromNodeId: string,
  toNodeId: string,
  text: string,
  encrypted: boolean = false
): MeshCorePacket {
  const encoder = new TextEncoder();
  const payload = encoder.encode(text);

  let flags = 0;
  if (encrypted) flags |= MeshCoreFlags.ENCRYPTED;

  // ID basé sur timestamp + compteur statique
  const now = Date.now();
  createTextMessageSync.counter = (createTextMessageSync.counter + 1) % 0xFFFF;
  const messageId = ((now % 0xFFFF) << 16) | createTextMessageSync.counter;

  return {
    version: 0x01,
    type: MeshCoreMessageType.TEXT,
    flags,
    ttl: 10,
    messageId,
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: nodeIdToUint64(toNodeId),
    timestamp: Math.floor(now / 1000),
    payload,
  };
}
createTextMessageSync.counter = 0;

/**
 * Extraire le texte d'un paquet MeshCore
 * Gère la décompression automatique
 */
export function extractTextFromPacket(packet: MeshCorePacket): string {
  // Vérifier si compressé
  if (packet.flags & MeshCoreFlags.COMPRESSED) {
    const { decompressFromLora } = require('./compression');
    return decompressFromLora(packet.payload);
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(packet.payload);
}

/**
 * Encoder un payload chiffré (EncryptedPayload) en binaire pour MeshCore
 * Format : [version (1 byte) | nonce (12 bytes) | ciphertext (variable)]
 */
export function encodeEncryptedPayload(enc: {v: number; nonce: string; ct: string}): Uint8Array {
  // Décoder base64 → bytes
  const nonceBytes = base64ToBytes(enc.nonce);
  const ctBytes = base64ToBytes(enc.ct);

  // Vérifier que nonce = 12 bytes (requis par AES-GCM)
  if (nonceBytes.length !== 12) {
    throw new Error('Nonce must be 12 bytes');
  }

  // Créer buffer : version (1) + nonce (12) + ciphertext (variable)
  const payload = new Uint8Array(1 + 12 + ctBytes.length);
  payload[0] = enc.v;
  payload.set(nonceBytes, 1);
  payload.set(ctBytes, 13);

  return payload;
}

/**
 * Décoder un payload binaire MeshCore en EncryptedPayload
 * Format : [version (1 byte) | nonce (12 bytes) | ciphertext (variable)]
 */
export function decodeEncryptedPayload(payload: Uint8Array): {v: number; nonce: string; ct: string} | null {
  // Minimum : 1 + 12 = 13 bytes
  if (payload.length < 13) {
    return null;
  }

  const version = payload[0];
  const nonceBytes = payload.slice(1, 13);
  const ctBytes = payload.slice(13);

  return {
    v: version,
    nonce: bytesToBase64(nonceBytes),
    ct: bytesToBase64(ctBytes),
  };
}

/**
 * Utils : base64 → Uint8Array
 */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

/**
 * Utils : Uint8Array → base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str);
}

/**
 * Calcul CRC16 (CCITT)
 */
function calculateCRC16(data: Uint8Array): number {
  let crc = 0xFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;

    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }

  return crc & 0xFFFF;
}

/**
 * Vérifier si un paquet nécessite un relay
 */
export function needsRelay(packet: MeshCorePacket, myNodeId: string): boolean {
  const myId = nodeIdToUint64(myNodeId);
  return packet.toNodeId !== myId && packet.ttl > 0;
}

/**
 * Préparer un paquet pour relay (décrémenter TTL)
 */
export function prepareRelay(packet: MeshCorePacket): MeshCorePacket {
  return {
    ...packet,
    ttl: packet.ttl - 1,
    flags: packet.flags | MeshCoreFlags.RELAY,
  };
}

/**
 * Créer un paquet PING
 */
export function createPingPacket(fromNodeId: string): MeshCorePacket {
  return {
    version: 0x01,
    type: MeshCoreMessageType.PING,
    flags: 0,
    ttl: 1,
    messageId: Math.floor(Math.random() * 0xFFFFFFFF),
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: 0n, // Broadcast
    timestamp: Math.floor(Date.now() / 1000),
    payload: new Uint8Array(0),
  };
}

/**
 * Créer un paquet KEY_ANNOUNCE pour échanger sa clé publique
 * Payload : pubkey compressed secp256k1 (33 bytes hex) encodé en UTF-8
 */
export function createKeyAnnouncePacket(fromNodeId: string, pubkeyHex: string): MeshCorePacket {
  const encoder = new TextEncoder();
  const payload = encoder.encode(pubkeyHex); // 66 chars hex = 33 bytes compressed pubkey

  return {
    version: 0x01,
    type: MeshCoreMessageType.KEY_ANNOUNCE,
    flags: MeshCoreFlags.BROADCAST,
    ttl: 3,
    messageId: Math.floor(Math.random() * 0xFFFFFFFF),
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: 0n, // Broadcast
    timestamp: Math.floor(Date.now() / 1000),
    payload,
  };
}

/**
 * Extraire la pubkey d'un paquet KEY_ANNOUNCE
 */
export function extractPubkeyFromAnnounce(packet: MeshCorePacket): string | null {
  if (packet.type !== MeshCoreMessageType.KEY_ANNOUNCE) {
    return null;
  }

  const decoder = new TextDecoder();
  const pubkeyHex = decoder.decode(packet.payload);

  // Valider que c'est bien du hex de 66 caractères (33 bytes compressed)
  if (!/^[0-9a-fA-F]{66}$/.test(pubkeyHex)) {
    return null;
  }

  return pubkeyHex;
}

/**
 * Créer un paquet d'annonce de position GPS
 */
export function createPositionPacket(
  fromNodeId: string,
  lat: number,
  lng: number,
  alt: number = 0
): MeshCorePacket {
  // Format payload : lat (4 bytes float) + lng (4 bytes float) + alt (2 bytes int16)
  const buffer = new ArrayBuffer(10);
  const view = new DataView(buffer);

  view.setFloat32(0, lat, false);
  view.setFloat32(4, lng, false);
  view.setInt16(8, Math.round(alt), false);

  return {
    version: 0x01,
    type: MeshCoreMessageType.POSITION,
    flags: MeshCoreFlags.BROADCAST,
    ttl: 3,
    messageId: Math.floor(Math.random() * 0xFFFFFFFF),
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: 0n, // Broadcast
    timestamp: Math.floor(Date.now() / 1000),
    payload: new Uint8Array(buffer),
  };
}

/**
 * Extraire position GPS d'un paquet
 */
export function extractPosition(packet: MeshCorePacket): { lat: number; lng: number; alt: number } | null {
  if (packet.type !== MeshCoreMessageType.POSITION || packet.payload.length < 10) {
    return null;
  }

  const view = new DataView(packet.payload.buffer, packet.payload.byteOffset);

  return {
    lat: view.getFloat32(0, false),
    lng: view.getFloat32(4, false),
    alt: view.getInt16(8, false),
  };
}
