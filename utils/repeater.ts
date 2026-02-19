/**
 * Repeater Configuration - Version Protocol Binaire MeshCore
 * 
 * Configuration des repeaters via protocol binaire meshcore.js officiel
 */

// Commandes Protocol Binaire MeshCore pour Repeater
const REPEATER_CMDS = {
  GET_INFO: 0x20,
  SET_NAME: 0x21,
  SET_CONFIG: 0x22,
  GET_STATUS: 0x23,
  GET_NEIGHBORS: 0x24,
  GET_STATS: 0x25,
  RESET_STATS: 0x26,
  REBOOT: 0x27,
  FACTORY_RESET: 0x28,
} as const;

export interface RepeaterConfig {
  name: string;
  maxHops: number;
  forwardDirectOnly: boolean;
  filterByPath: boolean;
  minRssi: number;
  transportCode?: string;
  bridgeMode: boolean;
}

export interface RepeaterStatus {
  online: boolean;
  packetsRelayed: number;
  packetsDropped: number;
  averageRssi: number;
  uptime: number;
  neighbors: RepeaterNeighbor[];
}

export interface RepeaterNeighbor {
  nodeId: string;
  rssi: number;
  lastSeen: number;
  hops: number;
}

export interface RepeaterStats {
  totalRelayed: number;
  totalDropped: number;
  byHour: number[];
}

function encodeRepeaterCommand(cmd: number, data?: Uint8Array): Uint8Array {
  const payload = new Uint8Array(data ? 1 + data.length : 1);
  payload[0] = cmd;
  if (data) payload.set(data, 1);
  return payload;
}

/**
 * Configure un repeater via protocol binaire meshcore.js
 */
export async function configureRepeater(
  sendFn: (data: Uint8Array) => Promise<void>,
  config: Partial<RepeaterConfig>
): Promise<boolean> {
  try {
    if (config.name) {
      const nameData = new TextEncoder().encode(config.name);
      await sendFn(encodeRepeaterCommand(REPEATER_CMDS.SET_NAME, nameData));
    }
    
    if (config.maxHops !== undefined || config.minRssi !== undefined) {
      const configData = new Uint8Array(3);
      configData[0] = config.maxHops || 5;
      configData[1] = config.minRssi ? Math.abs(config.minRssi) : 100;
      configData[2] = (config.forwardDirectOnly ? 1 : 0) | (config.filterByPath ? 2 : 0);
      await sendFn(encodeRepeaterCommand(REPEATER_CMDS.SET_CONFIG, configData));
    }
    
    console.log('[Repeater] Configuration envoyée via protocol binaire');
    return true;
  } catch (err) {
    console.error('[Repeater] Config error:', err);
    return false;
  }
}

/**
 * Récupère le statut d'un repeater
 */
export async function getRepeaterStatus(
  sendFn: (data: Uint8Array) => Promise<void>,
  onResponse: (timeoutMs: number) => Promise<Uint8Array | null>
): Promise<RepeaterStatus | null> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.GET_STATUS));
    const response = await onResponse(5000);
    if (!response || response.length < 14) return null;
    
    const view = new DataView(response.buffer, response.byteOffset, response.byteLength);
    return {
      online: response[0] === 1,
      packetsRelayed: view.getUint32(1, false),
      packetsDropped: view.getUint32(5, false),
      averageRssi: -view.getUint8(9),
      uptime: view.getUint32(10, false),
      neighbors: [],
    };
  } catch (err) {
    console.error('[Repeater] Status error:', err);
    return null;
  }
}

/**
 * Récupère la liste des voisins d'un repeater
 */
export async function getRepeaterNeighbors(
  sendFn: (data: Uint8Array) => Promise<void>,
  onResponse: (timeoutMs: number) => Promise<Uint8Array | null>
): Promise<RepeaterNeighbor[]> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.GET_NEIGHBORS));
    const response = await onResponse(5000);
    if (!response) return [];
    
    try {
      return JSON.parse(new TextDecoder().decode(response));
    } catch {
      return parseBinaryNeighbors(response);
    }
  } catch (err) {
    console.error('[Repeater] Neighbors error:', err);
    return [];
  }
}

function parseBinaryNeighbors(data: Uint8Array): RepeaterNeighbor[] {
  const neighbors: RepeaterNeighbor[] = [];
  let offset = 0;
  
  while (offset < data.length) {
    try {
      const idLen = data[offset++];
      const nodeId = new TextDecoder().decode(data.slice(offset, offset + idLen));
      offset += idLen;
      
      const rssi = -data[offset++];
      const view = new DataView(data.buffer, data.byteOffset + offset, 4);
      const lastSeen = view.getUint32(0, false);
      offset += 4;
      const hops = data[offset++];
      
      neighbors.push({ nodeId, rssi, lastSeen, hops });
    } catch {
      break;
    }
  }
  
  return neighbors;
}

/**
 * Récupère les statistiques d'un repeater
 */
export async function getRepeaterStats(
  sendFn: (data: Uint8Array) => Promise<void>,
  onResponse: (timeoutMs: number) => Promise<Uint8Array | null>
): Promise<RepeaterStats | null> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.GET_STATS));
    const response = await onResponse(5000);
    if (!response) return null;
    
    try {
      const data = JSON.parse(new TextDecoder().decode(response));
      return {
        totalRelayed: data.totalRelayed || 0,
        totalDropped: data.totalDropped || 0,
        byHour: data.byHour || new Array(24).fill(0),
      };
    } catch {
      const view = new DataView(response.buffer, response.byteOffset, response.byteLength);
      return {
        totalRelayed: view.getUint32(0, false),
        totalDropped: view.getUint32(4, false),
        byHour: new Array(24).fill(0),
      };
    }
  } catch (err) {
    console.error('[Repeater] Stats error:', err);
    return null;
  }
}

/**
 * Reset les statistiques d'un repeater
 */
export async function resetRepeaterStats(
  sendFn: (data: Uint8Array) => Promise<void>
): Promise<boolean> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.RESET_STATS));
    return true;
  } catch (err) {
    console.error('[Repeater] Reset stats error:', err);
    return false;
  }
}

/**
 * Redémarre un repeater
 */
export async function rebootRepeater(
  sendFn: (data: Uint8Array) => Promise<void>
): Promise<boolean> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.REBOOT));
    return true;
  } catch (err) {
    console.error('[Repeater] Reboot error:', err);
    return false;
  }
}

/**
 * Reset factory d'un repeater
 */
export async function factoryResetRepeater(
  sendFn: (data: Uint8Array) => Promise<void>
): Promise<boolean> {
  try {
    await sendFn(encodeRepeaterCommand(REPEATER_CMDS.FACTORY_RESET));
    return true;
  } catch (err) {
    console.error('[Repeater] Factory reset error:', err);
    return false;
  }
}
