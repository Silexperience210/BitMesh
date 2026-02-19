/**
 * Room Server Configuration
 * 
 * Configuration et gestion des Room Servers MeshCore via USB ou LoRa remote
 * Un Room Server est un nœud BBS (Bulletin Board System) pour forums partagés
 */

import { UsbSerialManager } from 'react-native-usb-serialport-for-android';

export interface RoomServerConfig {
  name: string;
  maxPeers: number;
  welcomeMessage: string;
  requireAuth: boolean;
  allowedPubkeys?: string[]; // ACL si auth requise
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

// Commandes AT pour configuration Room Server via USB
const AT_COMMANDS = {
  GET_INFO: 'AT+INFO',
  SET_NAME: 'AT+NAME=',
  SET_MAX_PEERS: 'AT+MAXPEERS=',
  SET_WELCOME: 'AT+WELCOME=',
  SET_AUTH: 'AT+AUTH=',
  GET_STATUS: 'AT+STATUS',
  GET_POSTS: 'AT+POSTS',
  DELETE_POST: 'AT+DELPOST=',
  REBOOT: 'AT+REBOOT',
  FACTORY_RESET: 'AT+FACTORY',
} as const;

/**
 * Configure un Room Server via USB Serial
 */
export async function configureRoomServer(
  deviceId: number,
  config: Partial<RoomServerConfig>
): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    // Configurer le nom
    if (config.name) {
      await sendCommand(serial, AT_COMMANDS.SET_NAME + config.name);
    }
    
    // Configurer max peers
    if (config.maxPeers) {
      await sendCommand(serial, AT_COMMANDS.SET_MAX_PEERS + config.maxPeers);
    }
    
    // Configurer message de bienvenue
    if (config.welcomeMessage) {
      await sendCommand(serial, AT_COMMANDS.SET_WELCOME + config.welcomeMessage);
    }
    
    // Configurer authentification
    if (config.requireAuth !== undefined) {
      await sendCommand(serial, AT_COMMANDS.SET_AUTH + (config.requireAuth ? '1' : '0'));
    }
    
    await serial.close();
    console.log('[RoomServer] Configuration applied');
    return true;
  } catch (err) {
    console.error('[RoomServer] Config error:', err);
    return false;
  }
}

/**
 * Récupère le statut d'un Room Server
 */
export async function getRoomServerStatus(deviceId: number): Promise<RoomServerStatus | null> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    const response = await sendCommand(serial, AT_COMMANDS.GET_STATUS);
    await serial.close();
    
    // Parser la réponse (format: STATUS:online,peers:5,messages:42,uptime:3600)
    const status = parseStatusResponse(response);
    return status;
  } catch (err) {
    console.error('[RoomServer] Status error:', err);
    return null;
  }
}

/**
 * Récupère les posts d'un Room Server
 */
export async function getRoomServerPosts(deviceId: number): Promise<RoomServerPost[]> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    
    const response = await sendCommand(serial, AT_COMMANDS.GET_POSTS);
    await serial.close();
    
    // Parser les posts (format JSON ou ligne par ligne)
    const posts = parsePostsResponse(response);
    return posts;
  } catch (err) {
    console.error('[RoomServer] Posts error:', err);
    return [];
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

function parseStatusResponse(response: string): RoomServerStatus {
  // Parser la réponse AT
  const parts = response.split(',');
  const online = parts[0]?.includes('online') || false;
  const peers = parseInt(parts[1]?.split(':')[1]) || 0;
  const messages = parseInt(parts[2]?.split(':')[1]) || 0;
  const uptime = parseInt(parts[3]?.split(':')[1]) || 0;
  
  return {
    online,
    connectedPeers: peers,
    totalMessages: messages,
    uptime,
    lastSeen: Date.now(),
  };
}

function parsePostsResponse(response: string): RoomServerPost[] {
  try {
    // Essayer de parser comme JSON
    return JSON.parse(response);
  } catch {
    // Fallback: parser ligne par ligne
    return response.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('|');
        return {
          id: parts[0] || '',
          author: parts[1] || '',
          content: parts[2] || '',
          timestamp: parseInt(parts[3]) || Date.now(),
          signature: parts[4] || '',
        };
      });
  }
}

/**
 * Redémarre un Room Server
 */
export async function rebootRoomServer(deviceId: number): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    await sendCommand(serial, AT_COMMANDS.REBOOT);
    await serial.close();
    return true;
  } catch (err) {
    console.error('[RoomServer] Reboot error:', err);
    return false;
  }
}

/**
 * Reset factory d'un Room Server
 */
export async function factoryResetRoomServer(deviceId: number): Promise<boolean> {
  try {
    const serial = await (UsbSerialManager as any).open(deviceId);
    await sendCommand(serial, AT_COMMANDS.FACTORY_RESET);
    await serial.close();
    return true;
  } catch (err) {
    console.error('[RoomServer] Factory reset error:', err);
    return false;
  }
}
