/**
 * MeshCore Protocol Implementation
 *
 * Protocole officiel MeshCore pour communication BLE + LoRa
 * Compatible avec firmware MeshCore Companion
 */

import { compressMeshCoreMessage, decompressMeshCoreMessage, shouldCompress } from './lzw';

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
  CHUNK_START = 0x08,    // Premier chunk d'un message batch
  CHUNK_MIDDLE = 0x09,   // Chunk intermédiaire
  CHUNK_END = 0x0A,      // Dernier chunk
}

// Flags MeshCore
export enum MeshCoreFlags {
  ENCRYPTED = 0x01,      // Payload chiffré
  COMPRESSED = 0x02,     // Payload compressé (LZW)
  MULTI_HOP = 0x04,      // Message multi-hop
  ACK_REQUESTED = 0x08,  // Accusé de réception demandé
  SUBMESH = 0x10,        // Sub-mesh ID présent
  SIGNED = 0x20,         // Message signé
  BROADCAST = 0x40,      // Broadcast à tous
  RELAY = 0x80,          // Relay requis
}

// Limite LoRa (taille max payload après header)
export const LORA_MAX_PAYLOAD = 200; // bytes
export const LORA_MAX_TEXT_CHARS = 200; // caractères

/**
 * Vérifie si un texte dépasse la limite LoRa
 */
export function validateMessageSize(text: string): { valid: boolean; size: number; max: number } {
  const encoder = new TextEncoder();
  const size = encoder.encode(text).length;
  return {
    valid: size <= LORA_MAX_PAYLOAD,
    size,
    max: LORA_MAX_PAYLOAD,
  };
}

/**
 * Interface pour un chunk de message
 */
export interface MessageChunk {
  chunkIndex: number;
  totalChunks: number;
  messageId: number;
  data: Uint8Array;
}

// Flags de message (définis plus haut avec LZW)

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
import { compressWithFallback, isCompressed, decompress } from './compression';

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
 * ✅ Compression automatique si avantageuse
 */
export function createTextMessageSync(
  fromNodeId: string,
  toNodeId: string,
  text: string,
  encrypted: boolean = false,
  useCompression: boolean = true
): MeshCorePacket {
  let payload: Uint8Array;
  let flags = 0;

  // ✅ Compression si activée et avantageuse (sauf si chiffré)
  if (useCompression && !encrypted) {
    const compressed = compressWithFallback(text);
    payload = compressed.data;
    if (compressed.compressed) {
      flags |= MeshCoreFlags.COMPRESSED;
      console.log('[MeshCore] Compression activée:', text.length, '→', payload.length, 'bytes');
    }
  } else {
    const encoder = new TextEncoder();
    payload = encoder.encode(text);
  }

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

import { decompressFromLora } from './compression';

/**
 * Extraire le texte d'un paquet MeshCore
 * Gère la décompression automatique
 */
export function extractTextFromPacket(packet: MeshCorePacket): string {
  // Vérifier si compressé
  if (packet.flags & MeshCoreFlags.COMPRESSED) {
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

// ============================================================================
// ACK (ACKNOWLEDGEMENT) - Confirmation de livraison
// ============================================================================

/**
 * Créer un paquet ACK pour confirmer la réception d'un message
 * Payload: [originalMessageId (4 bytes)]
 */
export function createAckPacket(
  fromNodeId: string,
  toNodeId: string,
  originalMessageId: number
): MeshCorePacket {
  const payload = new Uint8Array(4);
  const view = new DataView(payload.buffer);
  view.setUint32(0, originalMessageId, false);

  return {
    version: 0x01,
    type: MeshCoreMessageType.ACK,
    flags: 0,
    ttl: 10,
    messageId: Math.floor(Math.random() * 0xFFFFFFFF),
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: nodeIdToUint64(toNodeId),
    timestamp: Math.floor(Date.now() / 1000),
    payload,
  };
}

/**
 * Extraire l'info d'un ACK reçu
 * Retourne l'ID du message original confirmé
 */
export function extractAckInfo(payload: Uint8Array): { originalMessageId: number } | null {
  if (payload.length < 4) return null;
  
  const view = new DataView(payload.buffer, payload.byteOffset);
  const originalMessageId = view.getUint32(0, false);
  
  return { originalMessageId };
}

// ============================================================================
// CHUNKING / BATCH MESSAGING
// Pour envoyer des messages longs en plusieurs paquets LoRa
// ============================================================================

const CHUNK_HEADER_SIZE = 6; // bytes: [msgId(2) | chunkIdx(1) | totalChunks(1) | ...]
const CHUNK_MAX_PAYLOAD = LORA_MAX_PAYLOAD - CHUNK_HEADER_SIZE - 10; // Marge pour chiffrement

/**
 * Découpe un message long en chunks pour envoi LoRa
 * Retourne null si le message tient dans un seul paquet
 */
export function chunkMessage(
  text: string,
  messageId: number
): MessageChunk[] | null {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Si ça tient dans un seul paquet, pas besoin de chunking
  if (data.length <= LORA_MAX_PAYLOAD) {
    return null;
  }
  
  const chunks: MessageChunk[] = [];
  const totalChunks = Math.ceil(data.length / CHUNK_MAX_PAYLOAD);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_MAX_PAYLOAD;
    const end = Math.min(start + CHUNK_MAX_PAYLOAD, data.length);
    const chunkData = data.slice(start, end);
    
    // Header du chunk: [msgId(2 bytes) | chunkIdx(1) | totalChunks(1)]
    const header = new Uint8Array(4);
    const headerView = new DataView(header.buffer);
    headerView.setUint16(0, messageId % 65536, false); // 2 bytes
    header[2] = i; // chunkIndex
    header[3] = totalChunks; // totalChunks
    
    // Combiner header + data
    const fullChunk = new Uint8Array(header.length + chunkData.length);
    fullChunk.set(header, 0);
    fullChunk.set(chunkData, header.length);
    
    chunks.push({
      chunkIndex: i,
      totalChunks,
      messageId,
      data: fullChunk,
    });
  }
  
  return chunks;
}

/**
 * Crée un paquet MeshCore pour un chunk spécifique
 */
export function createChunkPacket(
  fromNodeId: string,
  toNodeId: string,
  chunk: MessageChunk,
  encrypted: boolean = false
): MeshCorePacket {
  let chunkType: MeshCoreMessageType;
  
  if (chunk.chunkIndex === 0) {
    chunkType = MeshCoreMessageType.CHUNK_START;
  } else if (chunk.chunkIndex === chunk.totalChunks - 1) {
    chunkType = MeshCoreMessageType.CHUNK_END;
  } else {
    chunkType = MeshCoreMessageType.CHUNK_MIDDLE;
  }
  
  return {
    version: 0x01,
    type: chunkType,
    flags: encrypted ? MeshCoreFlags.ENCRYPTED : 0,
    ttl: 10,
    messageId: chunk.messageId,
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: nodeIdToUint64(toNodeId),
    timestamp: Math.floor(Date.now() / 1000),
    payload: chunk.data,
  };
}

/**
 * Reconstitue un message à partir de chunks reçus
 * Retourne null si incomplet
 */
export function reassembleChunks(
  chunks: Map<number, Uint8Array>,
  totalChunks: number
): string | null {
  if (chunks.size !== totalChunks) {
    return null; // Pas tous les chunks
  }
  
  // Vérifier qu'on a tous les indices
  for (let i = 0; i < totalChunks; i++) {
    if (!chunks.has(i)) return null;
  }
  
  // Reconstituer
  const parts: Uint8Array[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i)!;
    // Skip header (4 bytes)
    parts.push(chunk.slice(4));
  }
  
  // Concaténer
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const fullData = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    fullData.set(part, offset);
    offset += part.length;
  }
  
  return new TextDecoder().decode(fullData);
}

/**
 * Vérifie si un paquet est un chunk (et non un message complet)
 */
export function isChunkPacket(packet: MeshCorePacket): boolean {
  return packet.type === MeshCoreMessageType.CHUNK_START ||
         packet.type === MeshCoreMessageType.CHUNK_MIDDLE ||
         packet.type === MeshCoreMessageType.CHUNK_END;
}

/**
 * Extrait les infos d'un chunk depuis son payload
 */
export function extractChunkInfo(payload: Uint8Array): { messageId: number; chunkIndex: number; totalChunks: number; data: Uint8Array } | null {
  if (payload.length < 4) return null;
  
  const view = new DataView(payload.buffer, payload.byteOffset);
  const messageId = view.getUint16(0, false);
  const chunkIndex = payload[2];
  const totalChunks = payload[3];
  const data = payload.slice(4);
  
  return { messageId, chunkIndex, totalChunks, data };
}

// Re-export pour compatibilité
export { compressWithFallback, decompress, isCompressed } from "./compression";
