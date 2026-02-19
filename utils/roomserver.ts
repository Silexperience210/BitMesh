/**
 * Room Server Configuration - Version Protocol Binaire MeshCore
 * 
 * Configuration des Room Servers via protocol binaire meshcore.js officiel
 */

// Commandes Protocol Binaire MeshCore pour Room Server
const ROOM_SERVER_CMDS = {
  GET_INFO: 0x10,
  SET_NAME: 0x11,
  SET_CONFIG: 0x12,
  GET_STATUS: 0x13,
  GET_POSTS: 0x14,
  POST_MESSAGE: 0x15,
  DELETE_POST: 0x16,
  REBOOT: 0x17,
  FACTORY_RESET: 0x18,
} as const;

export interface RoomServerConfig {
  name: string;
  maxPeers: number;
  welcomeMessage: string;
  requireAuth: boolean;
  allowedPubkeys?: string[];
  maxMessageLength: number;
  retentionDays: number;
}

export interface RoomServerStatus {
  online: boolean;
  connectedPeers: number;
  totalMessages: number;
  uptime: number;
  lastSeen: number;
}

export interface RoomServerPost {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  signature: string;
}

/**
 * Encode une commande Room Server en paquet MeshCore binaire
 */
function encodeRoomServerCommand(cmd: number, data?: Uint8Array): Uint8Array {
  const payload = new Uint8Array(data ? 1 + data.length : 1);
  payload[0] = cmd;
  if (data) payload.set(data, 1);
  return payload;
}

/**
 * Configure un Room Server via protocol binaire meshcore.js
 * 
 * @param sendFn - Fonction d'envoi de données (ex: sendRawData from MeshCoreProvider)
 * @param config - Configuration du Room Server
 * @returns true si succès
 */
export async function configureRoomServer(
  sendFn: (data: Uint8Array) => Promise<void>,
  config: Partial<RoomServerConfig>
): Promise<boolean> {
  try {
    // Configurer le nom
    if (config.name) {
      const nameData = new TextEncoder().encode(config.name);
      const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.SET_NAME, nameData);
      await sendFn(payload);
    }
    
    // Configurer max peers et options
    if (config.maxPeers !== undefined || config.requireAuth !== undefined) {
      const configData = new Uint8Array(2);
      configData[0] = config.maxPeers || 20;
      configData[1] = config.requireAuth ? 1 : 0;
      const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.SET_CONFIG, configData);
      await sendFn(payload);
    }
    
    console.log('[RoomServer] Configuration envoyée via protocol binaire');
    return true;
  } catch (err) {
    console.error('[RoomServer] Config error:', err);
    return false;
  }
}

/**
 * Récupère le statut d'un Room Server
 */
export async function getRoomServerStatus(
  sendFn: (data: Uint8Array) => Promise<void>,
  onResponse: (timeoutMs: number) => Promise<Uint8Array | null>
): Promise<RoomServerStatus | null> {
  try {
    const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.GET_STATUS);
    await sendFn(payload);
    
    const response = await onResponse(5000);
    if (!response || response.length < 10) return null;
    
    const view = new DataView(response.buffer, response.byteOffset, response.byteLength);
    return {
      online: response[0] === 1,
      connectedPeers: view.getUint16(1, false),
      totalMessages: view.getUint32(3, false),
      uptime: view.getUint32(7, false),
      lastSeen: Date.now(),
    };
  } catch (err) {
    console.error('[RoomServer] Status error:', err);
    return null;
  }
}

/**
 * Récupère les posts d'un Room Server
 */
export async function getRoomServerPosts(
  sendFn: (data: Uint8Array) => Promise<void>,
  onResponse: (timeoutMs: number) => Promise<Uint8Array | null>
): Promise<RoomServerPost[]> {
  try {
    const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.GET_POSTS);
    await sendFn(payload);
    
    const response = await onResponse(5000);
    if (!response) return [];
    
    try {
      const text = new TextDecoder().decode(response);
      return JSON.parse(text);
    } catch {
      return parseBinaryPosts(response);
    }
  } catch (err) {
    console.error('[RoomServer] Posts error:', err);
    return [];
  }
}

function parseBinaryPosts(data: Uint8Array): RoomServerPost[] {
  const posts: RoomServerPost[] = [];
  let offset = 0;
  
  while (offset < data.length) {
    try {
      const idLen = data[offset++];
      const id = new TextDecoder().decode(data.slice(offset, offset + idLen));
      offset += idLen;
      
      const authorLen = data[offset++];
      const author = new TextDecoder().decode(data.slice(offset, offset + authorLen));
      offset += authorLen;
      
      const contentLen = data[offset++];
      const content = new TextDecoder().decode(data.slice(offset, offset + contentLen));
      offset += contentLen;
      
      const view = new DataView(data.buffer, data.byteOffset + offset, 4);
      const timestamp = view.getUint32(0, false);
      offset += 4;
      
      posts.push({ id, author, content, timestamp, signature: '' });
    } catch {
      break;
    }
  }
  
  return posts;
}

/**
 * Redémarre un Room Server
 */
export async function rebootRoomServer(
  sendFn: (data: Uint8Array) => Promise<void>
): Promise<boolean> {
  try {
    const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.REBOOT);
    await sendFn(payload);
    return true;
  } catch (err) {
    console.error('[RoomServer] Reboot error:', err);
    return false;
  }
}

/**
 * Reset factory d'un Room Server
 */
export async function factoryResetRoomServer(
  sendFn: (data: Uint8Array) => Promise<void>
): Promise<boolean> {
  try {
    const payload = encodeRoomServerCommand(ROOM_SERVER_CMDS.FACTORY_RESET);
    await sendFn(payload);
    return true;
  } catch (err) {
    console.error('[RoomServer] Factory reset error:', err);
    return false;
  }
}
