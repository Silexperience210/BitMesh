/**
 * Repeater Configuration
 * 
 * Configuration des repeaters MeshCore via USB ou LoRa remote
 * Un repeater étend la portée du réseau en relayant les messages
 */

import { UsbSerialManager } from 'react-native-usb-serialport-for-android';

export interface RepeaterConfig {
  name: string;
  maxHops: number;           // Nombre max de sauts à relayer (1-10)
  forwardDirectOnly: boolean; // Ne relayer que les messages directs
  filterByPath: boolean;     // Filtrer par qualité de chemin
  minRssi: number;           // RSSI minimum pour relayer (-120 à -30)
  transportCode?: string;    // Code de transport pour zoning
  bridgeMode: boolean;       // Mode pont entre zones
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
  byHour: number[];  // Packets relayés par heure (24h)
}

// Commandes AT pour configuration Repeater
const AT_COMMANDS = {
  GET_INFO: 'AT+INFO',
  SET_NAME: 'AT+NAME=',
  SET_MAX_HOPS: 'AT+MAXHOPS=',
  SET_DIRECT_ONLY: 'AT+DIRECT=',
  SET_FILTER_PATH: 'AT+FILTER=',
  SET_MIN_RSSI: 'AT+MINRSSI=',
  SET_TRANSPORT: 'AT+TRANSPORT=',
  SET_BRIDGE: 'AT+BRIDGE=',
  GET_STATUS: 'AT+STATUS',
  GET_NEIGHBORS: 'AT+NEIGHBORS',
  GET_STATS: 'AT+STATS',
  RESET_STATS: 'AT+RESETSTATS',
  REBOOT: 'AT+REBOOT',
  FACTORY_RESET: 'AT+FACTORY',
} as const;

/**
 * Configure un repeater via USB Serial
 */
export async function configureRepeater(
  deviceId: number,
  config: Partial<RepeaterConfig>
): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    // Configurer le nom
    if (config.name) {
      await sendCommand(serial, AT_COMMANDS.SET_NAME + config.name);
    }
    
    // Configurer max hops
    if (config.maxHops !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_MAX_HOPS + config.maxHops);
    }
    
    // Configurer forward direct only
    if (config.forwardDirectOnly !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_DIRECT_ONLY + (config.forwardDirectOnly ? '1' : '0'));
    }
    
    // Configurer filter by path
    if (config.filterByPath !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_FILTER_PATH + (config.filterByPath ? '1' : '0'));
    }
    
    // Configurer min RSSI
    if (config.minRssi !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_MIN_RSSI + config.minRssi);
    }
    
    // Configurer transport code
    if (config.transportCode) {
      await sendCommand(serial, AT_COMMANDS.SET_TRANSPORT + config.transportCode);
    }
    
    // Configurer bridge mode
    if (config.bridgeMode !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_BRIDGE + (config.bridgeMode ? '1' : '0'));
    }
    
    await serial.close();
    console.log('[Repeater] Configuration applied');
    return true;
  } catch (err) {
    console.error('[Repeater] Config error:', err);
    return false;
  }
}

/**
 * Récupère le statut d'un repeater
 */
export async function getRepeaterStatus(deviceId: number): Promise<RepeaterStatus | null> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    const response = await sendCommand(serial, AT_COMMANDS.GET_STATUS);
    await serial.close();
    
    const status = parseStatusResponse(response);
    return status;
  } catch (err) {
    console.error('[Repeater] Status error:', err);
    return null;
  }
}

/**
 * Récupère la liste des voisins d'un repeater
 */
export async function getRepeaterNeighbors(deviceId: number): Promise<RepeaterNeighbor[]> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    const response = await sendCommand(serial, AT_COMMANDS.GET_NEIGHBORS);
    await serial.close();
    
    const neighbors = parseNeighborsResponse(response);
    return neighbors;
  } catch (err) {
    console.error('[Repeater] Neighbors error:', err);
    return [];
  }
}

/**
 * Récupère les statistiques d'un repeater
 */
export async function getRepeaterStats(deviceId: number): Promise<RepeaterStats | null> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    const response = await sendCommand(serial, AT_COMMANDS.GET_STATS);
    await serial.close();
    
    const stats = parseStatsResponse(response);
    return stats;
  } catch (err) {
    console.error('[Repeater] Stats error:', err);
    return null;
  }
}

/**
 * Reset les statistiques d'un repeater
 */
export async function resetRepeaterStats(deviceId: number): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    await sendCommand(serial, AT_COMMANDS.RESET_STATS);
    await serial.close();
    return true;
  } catch (err) {
    console.error('[Repeater] Reset stats error:', err);
    return false;
  }
}

/**
 * Redémarre un repeater
 */
export async function rebootRepeater(deviceId: number): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    await sendCommand(serial, AT_COMMANDS.REBOOT);
    await serial.close();
    return true;
  } catch (err) {
    console.error('[Repeater] Reboot error:', err);
    return false;
  }
}

/**
 * Reset factory d'un repeater
 */
export async function factoryResetRepeater(deviceId: number): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    await sendCommand(serial, AT_COMMANDS.FACTORY_RESET);
    await serial.close();
    return true;
  } catch (err) {
    console.error('[Repeater] Factory reset error:', err);
    return false;
  }
}

/**
 * Envoie une commande AT et attend la réponse
 */
async function sendCommand(serial: any, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let response = '';
    
    const timeout = setTimeout(() => {
      reject(new Error('Command timeout'));
    }, 5000);
    
    serial.onReceived((event: any) => {
      response += event.data;
      if (response.includes('OK') || response.includes('ERROR')) {
        clearTimeout(timeout);
        resolve(response);
      }
    });
    
    serial.send(command + '\r\n');
  });
}

function parseStatusResponse(response: string): RepeaterStatus {
  const parts = response.split(',');
  const online = parts[0]?.includes('online') || false;
  const relayed = parseInt(parts[1]?.split(':')[1]) || 0;
  const dropped = parseInt(parts[2]?.split(':')[1]) || 0;
  const avgRssi = parseInt(parts[3]?.split(':')[1]) || 0;
  const uptime = parseInt(parts[4]?.split(':')[1]) || 0;
  
  return {
    online,
    packetsRelayed: relayed,
    packetsDropped: dropped,
    averageRssi: avgRssi,
    uptime,
    neighbors: [],
  };
}

function parseNeighborsResponse(response: string): RepeaterNeighbor[] {
  try {
    return JSON.parse(response);
  } catch {
    return response.split('\n')
      .filter(line => line.trim() && line.includes('|'))
      .map(line => {
        const parts = line.split('|');
        return {
          nodeId: parts[0] || '',
          rssi: parseInt(parts[1]) || -100,
          lastSeen: parseInt(parts[2]) || Date.now(),
          hops: parseInt(parts[3]) || 1,
        };
      });
  }
}

function parseStatsResponse(response: string): RepeaterStats {
  try {
    const data = JSON.parse(response);
    return {
      totalRelayed: data.totalRelayed || 0,
      totalDropped: data.totalDropped || 0,
      byHour: data.byHour || new Array(24).fill(0),
    };
  } catch {
    const parts = response.split(',');
    return {
      totalRelayed: parseInt(parts[0]?.split(':')[1]) || 0,
      totalDropped: parseInt(parts[1]?.split(':')[1]) || 0,
      byHour: new Array(24).fill(0),
    };
  }
}
