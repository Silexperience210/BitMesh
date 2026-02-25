/**
 * BLE Gateway Client — MeshCore Companion Protocol (CORRIGÉ)
 *
 * Implémentation EXACTE de meshcore-open (Flutter officiel)
 * Source : https://github.com/zjs81/meshcore-open
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PROTOCOLE BLE — Nordic UART Service (NUS)                          ║
 * ║  App → Device : [cmd][payload...]   sur 6e400002 (RX/write)         ║
 * ║  Device → App : [code][data...]     sur 6e400003 (TX/notify)        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * CORRECTIONS APPLIQUÉES:
 * 1. Configuration automatique du canal 0 (public) au handshake
 * 2. Gestion correcte des messages de canal reçus (RESP_CHANNEL_MSG_V3)
 * 3. Vérification de l'état du canal avant envoi
 * 4. Logs détaillés pour debugging broadcast
 */

import BleManager from 'react-native-ble-manager';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';

// ── Utilitaires ─────────────────────────────────────────────────────────
function formatFreq(hz: number): string {
  if (hz >= 1000000) {
    return `${(hz / 1000000).toFixed(3)} MHz`;
  }
  return `${hz} Hz`;
}

// ── Nordic UART Service UUIDs ──────────────────────────────────────────
const SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID;
const TX_UUID      = MESHCORE_BLE.TX_CHAR_UUID; // 6e400002  App → Device (WRITE)
const RX_UUID      = MESHCORE_BLE.RX_CHAR_UUID; // 6e400003  Device → App (NOTIFY)

// ── Commandes App → Device ────────────────────────────────────────────
const CMD_APP_START          = 1;
const CMD_SEND_TXT_MSG       = 2;
const CMD_SEND_CHAN_MSG      = 3;
const CMD_GET_CONTACTS       = 4;
const CMD_SET_TIME           = 6;
const CMD_SEND_SELF_ADV      = 7;
const CMD_SYNC_NEXT_MSG      = 10;
const CMD_GET_BATT_STORAGE   = 20;
const CMD_DEVICE_QUERY       = 22;
const CMD_SEND_RAW           = 25;
const CMD_GET_CHANNEL        = 31;
const CMD_SET_CHANNEL        = 32; // 0x20
const CMD_GET_CUSTOM_VAR     = 40;

// ── Réponses / Push Device → App ──────────────────────────────────────
const RESP_OK               = 0;
const RESP_CONTACTS_START   = 2;
const RESP_CONTACT          = 3;
const RESP_END_CONTACTS     = 4;
const RESP_SELF_INFO        = 5;
const RESP_SENT             = 6;
const RESP_DIRECT_MSG       = 7;
const RESP_CHANNEL_MSG      = 8;
const RESP_NO_MORE_MSGS     = 10;
const RESP_BATT_STORAGE     = 12;
const RESP_DEVICE_INFO      = 13;
const RESP_DIRECT_MSG_V3    = 16;
const RESP_CHANNEL_MSG_V3   = 17;
const RESP_CHANNEL_INFO     = 18;
const RESP_CUSTOM_VARS      = 21;
const RESP_RADIO_SETTINGS   = 25;
const PUSH_ADVERT           = 0x80;
const PUSH_SEND_CONFIRMED   = 0x82;
const PUSH_MSG_WAITING      = 0x83;
const PUSH_RAW_DATA         = 0x84;
const PUSH_NEW_ADVERT       = 0x8A;

const APP_PROTOCOL_VERSION = 1;
const RAW_PUSH_HEADER_SIZE = 3;
const BLE_MAX_WRITE        = 182;

// ── Configuration canal par défaut ────────────────────────────────────
// Canal 0 = Public (doit être configuré pour recevoir les broadcasts)
const DEFAULT_CHANNEL_NAME = 'public';
const DEFAULT_CHANNEL_SECRET = new Uint8Array(32); // 32 zéros = canal public par défaut

// ── Types publics ──────────────────────────────────────────────────────

export interface BleGatewayDevice {
  id: string;
  name: string;
  rssi: number;
  type?: 'gateway' | 'companion';
}

export interface BleDeviceInfo {
  name: string;
  publicKey: string;
  txPower: number;
  radioFreqHz: number;
  radioBwHz: number;
  radioSf: number;
  radioCr: number;
  advLat: number;
  advLon: number;
}

export interface MeshCoreContact {
  publicKey: Uint8Array;
  pubkeyHex: string;
  pubkeyPrefix: string;
  name: string;
  lastSeen: number;
  lat?: number;
  lng?: number;
}

export interface MeshCoreIncomingMsg {
  type: 'direct' | 'channel';
  channelIdx?: number;
  senderPubkeyPrefix: string;
  pathLen: number;
  timestamp: number;
  text: string;
  snr?: number;
}

export interface ChannelConfig {
  index: number;
  name: string;
  secret: Uint8Array;
  configured: boolean;
}

type MessageHandler    = (packet: MeshCorePacket) => void;
type BleSubscription   = { remove: () => void };

// ── BleGatewayClient ──────────────────────────────────────────────────

export class BleGatewayClient {
  private connectedId: string | null = null;
  private messageHandler: MessageHandler | null = null;
  private deviceInfo: BleDeviceInfo | null = null;
  private listeners: BleSubscription[] = [];

  // Protocole natif MeshCore Companion
  private deviceInfoCallback:      ((info: BleDeviceInfo) => void) | null = null;
  private incomingMessageCallback: ((msg: MeshCoreIncomingMsg) => void) | null = null;
  private contactDiscoveredCallback: ((contact: MeshCoreContact) => void) | null = null;
  private contactsCallback:        ((contacts: MeshCoreContact[]) => void) | null = null;
  private sendConfirmedCallback:   ((ackCode: number, roundTripMs: number) => void) | null = null;
  private disconnectCallback:      (() => void) | null = null;
  private pendingContacts: MeshCoreContact[] = [];

  // Configuration des canaux
  private channelConfigs: Map<number, ChannelConfig> = new Map();

  // Handshake SelfInfo
  private awaitingSelfInfo = false;
  private selfInfoRetryTimer: ReturnType<typeof setInterval> | null = null;
  private selfInfoResolvers: Array<() => void> = [];

  // WriteWithoutResponse détecté après retrieveServices
  private canWriteWithoutResponse = false;

  constructor() {}

  // ── Initialisation ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await BleManager.start({ showAlert: false });
    console.log('[BleGateway] BleManager démarré');
  }

  // ── Connect ───────────────────────────────────────────────────────

  async connect(deviceId: string): Promise<void> {
    this.listeners.forEach(l => l.remove());
    this.listeners = [];
    this.clearSelfInfoRetry();
    this.selfInfoResolvers = [];
    this.awaitingSelfInfo = false;
    this.canWriteWithoutResponse = false;
    this.channelConfigs.clear();

    console.log(`[BleGateway] Connexion à ${deviceId}...`);

    await BleManager.connect(deviceId);
    this.connectedId = deviceId;
    console.log('[BleGateway] Connecté');

    try {
      const mtu = await BleManager.requestMTU(deviceId, 185);
      console.log(`[BleGateway] MTU: ${mtu}`);
    } catch {
      console.log('[BleGateway] MTU ignoré');
    }

    const services = await BleManager.retrieveServices(deviceId) as any;
    const hasUart =
      services.serviceUUIDs?.some((u: string) => u.toLowerCase() === SERVICE_UUID.toLowerCase()) ||
      services.services?.some((s: any) => s.uuid?.toLowerCase() === SERVICE_UUID.toLowerCase());
    if (!hasUart) {
      await BleManager.disconnect(deviceId);
      this.connectedId = null;
      throw new Error('Service Nordic UART non trouvé — firmware MeshCore Companion requis.');
    }
    console.log('[BleGateway] Nordic UART Service trouvé');

    const allChars: any[] = services.characteristics || [];
    for (const char of allChars) {
      const uuid = (char.characteristic || char.uuid || '').toLowerCase();
      if (uuid === TX_UUID.toLowerCase() || uuid.startsWith('6e400002')) {
        this.canWriteWithoutResponse = !!char.properties?.WriteWithoutResponse;
        break;
      }
    }
    console.log(`[BleGateway] WriteWithoutResponse: ${this.canWriteWithoutResponse}`);

    let notifySet = false;
    for (let attempt = 0; attempt < 3 && !notifySet; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
        await BleManager.startNotification(deviceId, SERVICE_UUID, RX_UUID);
        notifySet = true;
        console.log(`[BleGateway] Notifications activées (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`[BleGateway] startNotification ${attempt + 1}/3 échoué`);
        if (attempt === 2) throw e;
      }
    }

    const notifListener = BleManager.onDidUpdateValueForCharacteristic((data) => {
      if (data.peripheral !== deviceId) return;
      if (data.characteristic?.toLowerCase() !== RX_UUID.toLowerCase()) return;
      this.handleFrame(new Uint8Array(data.value));
    });
    this.listeners.push(notifListener);

    const discListener = BleManager.onDisconnectPeripheral((data) => {
      if (data.peripheral !== deviceId) return;
      console.log('[BleGateway] Device déconnecté');
      this.connectedId = null;
      this.clearSelfInfoRetry();
      this.disconnectCallback?.();
    });
    this.listeners.push(discListener);

    // Handshake
    this.awaitingSelfInfo = true;
    await this.sendFrame(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
    await this.sendAppStart();
    await this.sendFrame(CMD_GET_CUSTOM_VAR, new Uint8Array(0));
    await this.sendFrame(CMD_GET_BATT_STORAGE, new Uint8Array(0));
    this.scheduleSelfInfoRetry();

    const gotSelfInfo = await this.waitForSelfInfo(3000);
    if (!gotSelfInfo) {
      console.log('[BleGateway] SelfInfo non reçu — retry requestDeviceInfo...');
      await this.sendFrame(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
      await this.sendAppStart();
      await this.waitForSelfInfo(3000);
    }

    // CORRECTION: Configurer le canal 0 (public) automatiquement
    await this.configureDefaultChannels();

    this.getChannels().catch(e => console.warn('[BleGateway] getChannels:', e));
    this.getContacts().catch(e => console.warn('[BleGateway] getContacts:', e));
    this.sendSelfAdvert(1).catch(e => console.warn('[BleGateway] SelfAdvert:', e));

    console.log('[BleGateway] Handshake terminé');
  }

  // ── Configuration des canaux par défaut ────────────────────────────
  
  private async configureDefaultChannels(): Promise<void> {
    console.log('[BleGateway] Configuration des canaux par défaut...');
    
    // Canal 0 = Public (pour broadcasts)
    try {
      await this.setChannel(0, DEFAULT_CHANNEL_NAME, DEFAULT_CHANNEL_SECRET);
      this.channelConfigs.set(0, {
        index: 0,
        name: DEFAULT_CHANNEL_NAME,
        secret: DEFAULT_CHANNEL_SECRET,
        configured: true
      });
      console.log('[BleGateway] Canal 0 (public) configuré avec succès');
    } catch (err) {
      console.warn('[BleGateway] Impossible de configurer canal 0:', err);
    }
  }

  // ── Disconnect ──────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    this.clearSelfInfoRetry();
    this.selfInfoResolvers = [];
    this.awaitingSelfInfo = false;
    this.listeners.forEach(l => l.remove());
    this.listeners = [];
    this.channelConfigs.clear();
    if (this.connectedId) {
      console.log('[BleGateway] Déconnexion...');
      await BleManager.disconnect(this.connectedId).catch(() => {});
      this.connectedId = null;
    }
  }

  // ── SelfInfo retry ──────────────────────────────────────────────

  private async sendAppStart(): Promise<void> {
    const appNameBytes = new TextEncoder().encode('BitMesh\0');
    const payload = new Uint8Array(1 + 6 + appNameBytes.length);
    payload[0] = 0x01;
    payload.set(appNameBytes, 7);
    await this.sendFrame(CMD_APP_START, payload);
    console.log('[BleGateway] AppStart envoyé');
  }

  private scheduleSelfInfoRetry(): void {
    this.clearSelfInfoRetry();
    this.selfInfoRetryTimer = setInterval(async () => {
      if (!this.connectedId || !this.awaitingSelfInfo) {
        this.clearSelfInfoRetry();
        return;
      }
      console.log('[BleGateway] SelfInfo retry — re-envoi AppStart...');
      this.sendAppStart().catch(() => {});
    }, 3500);
  }

  private clearSelfInfoRetry(): void {
    if (this.selfInfoRetryTimer !== null) {
      clearInterval(this.selfInfoRetryTimer);
      this.selfInfoRetryTimer = null;
    }
  }

  private waitForSelfInfo(timeoutMs: number): Promise<boolean> {
    if (!this.awaitingSelfInfo) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const resolver = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(true);
        }
      };
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          this.selfInfoResolvers = this.selfInfoResolvers.filter(r => r !== resolver);
          resolve(false);
        }
      }, timeoutMs);
      this.selfInfoResolvers.push(resolver);
    });
  }

  // ── Protocole natif MeshCore Companion ──────────────────────────

  async sendDirectMessage(pubkeyPrefix6: Uint8Array, text: string, attempt = 0): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    const ts = Math.floor(Date.now() / 1000);
    const textBytes = new TextEncoder().encode(text);
    const payload = new Uint8Array(2 + 4 + 6 + textBytes.length);
    let off = 0;
    payload[off++] = 0x00; // txtType = 0 (plain)
    payload[off++] = attempt & 0xFF;
    new DataView(payload.buffer, payload.byteOffset).setUint32(off, ts, true); off += 4;
    payload.set(pubkeyPrefix6.slice(0, 6), off); off += 6;
    payload.set(textBytes, off);
    const prefixHex = Array.from(pubkeyPrefix6.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`[BleGateway] CMD_SEND_TXT_MSG prefix=${prefixHex}, text="${text.substring(0, 30)}...", len=${textBytes.length}`);
    await this.sendFrame(CMD_SEND_TXT_MSG, payload);
    console.log(`[BleGateway] CMD_SEND_TXT_MSG envoyé, en attente de RESP_SENT...`);
  }

  async sendChannelMessage(channelIdx: number, text: string): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    
    // CORRECTION: Vérifier que le canal est configuré
    const channelConfig = this.channelConfigs.get(channelIdx);
    if (!channelConfig?.configured) {
      console.warn(`[BleGateway] Canal ${channelIdx} non configuré! Configuration auto...`);
      if (channelIdx === 0) {
        await this.configureDefaultChannels();
      } else {
        throw new Error(`Canal ${channelIdx} non configuré. Utilisez setChannel() d'abord.`);
      }
    }
    
    const ts = Math.floor(Date.now() / 1000);
    const textBytes = new TextEncoder().encode(text);
    
    // Vérification taille max
    if (textBytes.length > 150) {
      throw new Error(`Message trop long: ${textBytes.length} bytes (max 150)`);
    }
    
    const payload = new Uint8Array(2 + 4 + textBytes.length);
    let off = 0;
    payload[off++] = 0x00; // txtType = 0 (plain)
    payload[off++] = channelIdx & 0xFF;
    new DataView(payload.buffer, payload.byteOffset).setUint32(off, ts, true); off += 4;
    payload.set(textBytes, off);
    
    console.log(`[BleGateway] 🚀 ENVOI BROADCAST ch=${channelIdx}`);
    console.log(`[BleGateway]    Texte: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
    console.log(`[BleGateway]    Taille: ${textBytes.length} bytes`);
    console.log(`[BleGateway]    Canal configuré: ${channelConfig?.name || 'public'}`);
    
    await this.sendFrame(CMD_SEND_CHAN_MSG, payload);
    console.log(`[BleGateway] ✓ CMD_SEND_CHAN_MSG envoyé au firmware`);
    console.log(`[BleGateway]    En attente de RESP_SENT puis PUSH_SEND_CONFIRMED...`);
  }

  async syncNextMessage(): Promise<void> {
    if (!this.connectedId) return;
    await this.sendFrame(CMD_SYNC_NEXT_MSG, new Uint8Array(0));
  }

  async sendSelfAdvert(type: 0 | 1 = 1): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    await this.sendFrame(CMD_SEND_SELF_ADV, new Uint8Array([type]));
  }

  async getContacts(): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    this.pendingContacts = [];
    await this.sendFrame(CMD_GET_CONTACTS, new Uint8Array(0));
  }

  async getChannels(maxChannels = 8): Promise<void> {
    if (!this.connectedId) return;
    console.log(`[BleGateway] getChannels(${maxChannels})...`);
    for (let i = 0; i < maxChannels; i++) {
      if (!this.connectedId) break;
      try {
        await this.sendFrame(CMD_GET_CHANNEL, new Uint8Array([i]));
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        console.warn(`[BleGateway] getChannel[${i}] échoué:`, e);
      }
    }
  }

  // ── CORRECTION: setChannel pour configurer les canaux ─────────────
  async setChannel(channelIdx: number, name: string, secret: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    if (channelIdx < 0 || channelIdx > 7) {
      throw new Error(`Index canal invalide: ${channelIdx} (0-7)`);
    }
    
    // Format: [idx(1)] [name(32)] [secret(32)]
    const payload = new Uint8Array(1 + 32 + 32);
    payload[0] = channelIdx & 0xFF;
    
    // Nom (32 bytes, null-terminated)
    const nameBytes = new TextEncoder().encode(name.slice(0, 31));
    payload.set(nameBytes, 1);
    
    // Secret (32 bytes)
    payload.set(secret.slice(0, 32), 33);
    
    console.log(`[BleGateway] Configuration canal ${channelIdx}: "${name}"`);
    await this.sendFrame(CMD_SET_CHANNEL, payload);
    
    // Sauvegarder la config localement
    this.channelConfigs.set(channelIdx, {
      index: channelIdx,
      name,
      secret: secret.slice(0, 32),
      configured: true
    });
    
    console.log(`[BleGateway] ✓ Canal ${channelIdx} configuré`);
  }

  async sendPacket(packet: MeshCorePacket): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    const encoded = encodeMeshCorePacket(packet);
    const payload = new Uint8Array(1 + encoded.length);
    payload[0] = 0x00;
    payload.set(encoded, 1);
    await this.sendFrame(CMD_SEND_RAW, payload);
  }

  // ── Callbacks publics ────────────────────────────────────────────

  onMessage(handler: MessageHandler): void            { this.messageHandler = handler; }
  onDeviceInfo(cb: (info: BleDeviceInfo) => void): void     { this.deviceInfoCallback = cb; }
  onIncomingMessage(cb: (msg: MeshCoreIncomingMsg) => void): void { this.incomingMessageCallback = cb; }
  onContactDiscovered(cb: (c: MeshCoreContact) => void): void     { this.contactDiscoveredCallback = cb; }
  onContacts(cb: (contacts: MeshCoreContact[]) => void): void     { this.contactsCallback = cb; }
  onSendConfirmed(cb: (ackCode: number, rtt: number) => void): void { this.sendConfirmedCallback = cb; }
  onDisconnect(cb: () => void): void                  { this.disconnectCallback = cb; }

  getDeviceInfo(): BleDeviceInfo | null  { return this.deviceInfo; }
  isConnected(): boolean                 { return this.connectedId !== null; }
  getConnectedDevice(): BleGatewayDevice | null {
    if (!this.connectedId) return null;
    return { id: this.connectedId, name: this.deviceInfo?.name || 'MeshCore', rssi: -70 };
  }
  getChannelConfig(index: number): ChannelConfig | undefined {
    return this.channelConfigs.get(index);
  }

  async destroy(): Promise<void> { await this.disconnect(); }

  // ── Privé : Frame handler ───────────────────────────────────────

  private handleFrame(data: Uint8Array): void {
    if (data.length === 0) return;
    const code = data[0];
    const payload = data.slice(1);
    if (__DEV__) console.log(`[BleGateway] Frame reçu code=0x${code.toString(16)} (${payload.length}B)`);

    switch (code) {
      case RESP_OK:
        break;
      case RESP_CONTACTS_START: {
        this.pendingContacts = [];
        if (payload.length >= 4) {
          const count = new DataView(payload.buffer, payload.byteOffset).getUint32(0, true);
          console.log(`[BleGateway] Contacts start: ${count} attendus`);
        }
        break;
      }
      case RESP_CONTACT:
        this.parseContact(payload);
        break;
      case PUSH_NEW_ADVERT:
        this.parseContact(payload);
        break;
      case RESP_END_CONTACTS:
        console.log(`[BleGateway] ${this.pendingContacts.length} contacts chargés`);
        if (this.contactsCallback) this.contactsCallback([...this.pendingContacts]);
        break;
      case RESP_SELF_INFO:
        this.parseSelfInfo(payload);
        break;
      case RESP_SENT:
        console.log('[BleGateway] ✓ RESP_SENT - Message accepté par le firmware et mis en file pour LoRa');
        break;
      case RESP_DIRECT_MSG:
        console.log('[BleGateway] RESP_DIRECT_MSG (v2) — ignoré');
        break;
      case RESP_CHANNEL_MSG:
        console.log('[BleGateway] RESP_CHANNEL_MSG (v2) — ignoré');
        break;
      case RESP_NO_MORE_MSGS:
        console.log('[BleGateway] RESP_NO_MORE_MSGS');
        break;
      case RESP_BATT_STORAGE:
        console.log('[BleGateway] RESP_BATT_STORAGE reçu');
        break;
      case RESP_DEVICE_INFO:
        console.log('[BleGateway] RESP_DEVICE_INFO reçu');
        break;
      // CORRECTION: Gestion correcte des messages de canal V3
      case RESP_DIRECT_MSG_V3:
        this.parseDirectMsgV3(payload);
        break;
      case RESP_CHANNEL_MSG_V3:
        this.parseChannelMsgV3(payload);
        break;
      case RESP_CHANNEL_INFO:
        this.parseChannelInfo(payload);
        break;
      case RESP_CUSTOM_VARS:
        console.log('[BleGateway] RESP_CUSTOM_VARS reçu');
        break;
      case RESP_RADIO_SETTINGS:
        console.log('[BleGateway] RESP_RADIO_SETTINGS reçu');
        break;
      case PUSH_ADVERT:
        this.parsePushAdvert(payload);
        break;
      case PUSH_SEND_CONFIRMED:
        this.parseSendConfirmed(payload);
        break;
      case PUSH_MSG_WAITING:
        console.log('[BleGateway] PUSH_MSG_WAITING → syncNextMessage()');
        this.syncNextMessage().catch(e => console.warn('[BleGateway] syncNextMessage:', e));
        break;
      case PUSH_RAW_DATA:
        if (payload.length > RAW_PUSH_HEADER_SIZE) {
          const snr  = (payload[0] << 24 >> 24) / 4;
          const rssi = payload[1] << 24 >> 24;
          const raw  = payload.slice(RAW_PUSH_HEADER_SIZE);
          if (__DEV__) console.log(`[BleGateway] RawData SNR:${snr} RSSI:${rssi} (${raw.length}B)`);
          this.deliverRawPacket(raw);
        }
        break;
      default:
        console.log(`[BleGateway] Code non géré 0x${code.toString(16)}`);
    }
  }

  // ── Privé : SelfInfo parser ─────────────────────────────────────

  private parseSelfInfo(payload: Uint8Array): void {
    // DEBUG ULTRA-DÉTAILLÉ
    const hexDump = Array.from(payload).map(b => b.toString(16).padStart(2,'0')).join(' ');
    console.log('[BleGateway] ═══════════════════════════════════════════');
    console.log('[BleGateway] SelfInfo RAW BYTES (' + payload.length + ' bytes):');
    console.log('[BleGateway] ' + hexDump);
    
    // Chercher la fréquence 869.525 MHz (0x33D4C148 = little-endian: 48 C1 D4 33)
    const targetBytes = [0x48, 0xC1, 0xD4, 0x33]; // 869.525 MHz
    for (let i = 0; i <= payload.length - 4; i++) {
      if (payload[i] === targetBytes[0] && 
          payload[i+1] === targetBytes[1] && 
          payload[i+2] === targetBytes[2] && 
          payload[i+3] === targetBytes[3]) {
        console.log('[BleGateway] ✅ FREQ 869.525 MHz TROUVÉE à offset ' + i + ' !');
      }
    }
    
    // Afficher toutes les valeurs Uint32 à chaque offset de 4 en 4
    const view = new DataView(payload.buffer, payload.byteOffset);
    console.log('[BleGateway] --- Scan Uint32 ---');
    for (let offset = 0; offset <= payload.length - 4; offset += 4) {
      const val = view.getUint32(offset, true);
      if (val >= 400000000 && val <= 1000000000) {
        console.log('[BleGateway] Offset ' + offset + ': ' + val + ' Hz (' + (val/1000000).toFixed(3) + ' MHz)');
      }
    }
    console.log('[BleGateway] ═══════════════════════════════════════════');
    
    if (payload.length < 58) {
      console.warn('[BleGateway] SelfInfo trop court:', payload.length);
      return;
    }
    
    let off = 0;
    
    const msgType = payload[off++];
    const txPower = payload[off++];
    const maxTx = payload[off++];
    const flags = payload[off++];
    
    console.log('[BleGateway] Header:', { msgType, txPower, maxTx, flags });

    const pubkeyBytes = payload.slice(off, off + 32); off += 32;
    const publicKey = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const advLatRaw = view.getInt32(off, true);  off += 4;
    const advLonRaw = view.getInt32(off, true);  off += 4;
    
    // 4 bytes supplémentaires (peut être l'altitude ou autres selon version)
    const extraField = view.getInt32(off, true); off += 4;
    
    console.log('[BleGateway] Après lat/lon/extra, offset=' + off);

    const radioFreqHz = view.getUint32(off, true); off += 4;
    const radioBwHz = view.getUint32(off, true); off += 4;
    const radioSf = payload[off++];
    const radioCr = payload[off++];

    const nameRaw = payload.slice(off);
    const name = new TextDecoder().decode(nameRaw).replace(/\0/g, '').trim() || 'MeshCore';

    const info: BleDeviceInfo = {
      name, publicKey, txPower, radioFreqHz, radioBwHz, radioSf, radioCr,
      advLat: advLatRaw / 1e7, advLon: advLonRaw / 1e7,
    };
    this.deviceInfo = info;
    
    console.log('[BleGateway] SelfInfo parsed:', { name, freq: radioFreqHz, sf: radioSf, txPower });

    if (this.deviceInfoCallback) this.deviceInfoCallback(info);

    // Envoyer l'heure au device
    const ts = Math.floor(Date.now() / 1000);
    const timeBuf = new Uint8Array(4);
    new DataView(timeBuf.buffer).setUint32(0, ts, true);
    this.sendFrame(CMD_SET_TIME, timeBuf)
      .then(() => console.log('[BleGateway] SetTime envoyé:', ts))
      .catch(e => console.warn('[BleGateway] SetTime:', e));

    this.awaitingSelfInfo = false;
    this.clearSelfInfoRetry();
    const resolvers = [...this.selfInfoResolvers];
    this.selfInfoResolvers = [];
    resolvers.forEach(r => r());
  }

  // ── Tentative de trouver la fréquence correcte dans le packet ──
  private tryFindCorrectFrequency(payload: Uint8Array, view: DataView): void {
    console.log('[BleGateway] 🔍 Recherche de la fréquence correcte...');
    
    // Essayer différents offsets possibles pour la fréquence (868 MHz = 0x33D09540 en little-endian)
    const targetFreqs = [869525000, 868000000, 915000000];
    
    for (let offset = 40; offset < payload.length - 4; offset += 4) {
      const val = view.getUint32(offset, true);
      if (val >= 400000000 && val <= 1000000000) {
        console.log(`[BleGateway]   Offset ${offset}: ${val} Hz (${formatFreq(val)})`);
        // Vérifier si c'est une fréquence LoRa valide
        if (targetFreqs.some(tf => Math.abs(val - tf) < 5000000)) {
          console.log(`[BleGateway]   ✅ Fréquence plausible trouvée à offset ${offset}: ${val} Hz`);
        }
      }
    }
  }

  // ── Privé : Parsers messages natifs ─────────────────────────────

  private parseDirectMsgV3(payload: Uint8Array): void {
    if (payload.length < 15) {
      console.warn('[BleGateway] RESP_DIRECT_MSG_V3 trop court:', payload.length);
      return;
    }
    const snrByte = payload[0];
    const prefixBytes = payload.slice(3, 9);
    const senderPubkeyPrefix = Array.from(prefixBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pathLen = payload[9];
    const view = new DataView(payload.buffer, payload.byteOffset);
    const timestamp = view.getUint32(11, true);
    const text = new TextDecoder().decode(payload.slice(15)).replace(/\0/g, '');
    const snr = snrByte / 4.0;
    
    console.log(`[BleGateway] 📨 DM REÇU de ${senderPubkeyPrefix.slice(0, 8)}...`);
    console.log(`[BleGateway]    Texte: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}"`);
    console.log(`[BleGateway]    SNR: ${snr}dB, Hops: ${pathLen}`);
    
    this.incomingMessageCallback?.({ type: 'direct', senderPubkeyPrefix, pathLen, timestamp, text, snr });
  }

  // CORRECTION: Parser complet pour les messages de canal
  private parseChannelMsgV3(payload: Uint8Array): void {
    if (payload.length < 10) {
      console.warn('[BleGateway] ⚠️ RESP_CHANNEL_MSG_V3 trop court:', payload.length);
      return;
    }
    
    const snrByte = payload[0];
    const channelIdx = payload[3];
    const pathLen = payload[4];
    const view = new DataView(payload.buffer, payload.byteOffset);
    const timestamp = view.getUint32(6, true);
    const text = new TextDecoder().decode(payload.slice(10)).replace(/\0/g, '');
    const snr = snrByte / 4.0;
    
    console.log(`[BleGateway] 📢 MESSAGE CANAL REÇU !`);
    console.log(`[BleGateway]    Canal: ${channelIdx} (${channelIdx === 0 ? 'public' : 'privé'})`);
    console.log(`[BleGateway]    Texte: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`[BleGateway]    SNR: ${snr}dB, Hops: ${pathLen}`);
    console.log(`[BleGateway]    Timestamp: ${new Date(timestamp * 1000).toLocaleTimeString()}`);
    
    // Vérifier si on a ce canal configuré
    const channelConfig = this.channelConfigs.get(channelIdx);
    if (channelConfig) {
      console.log(`[BleGateway]    ✓ Canal configuré: "${channelConfig.name}"`);
    } else {
      console.warn(`[BleGateway]    ⚠️ Canal ${channelIdx} non configuré localement`);
    }
    
    this.incomingMessageCallback?.({ 
      type: 'channel', 
      channelIdx, 
      senderPubkeyPrefix: '', // Les messages canal n'ont pas de pubkey expéditeur visible
      pathLen, 
      timestamp, 
      text, 
      snr 
    });
  }

  // CORRECTION: Parser pour les infos de canal
  private parseChannelInfo(payload: Uint8Array): void {
    if (payload.length < 1) {
      console.warn('[BleGateway] RESP_CHANNEL_INFO trop court');
      return;
    }
    
    const channelIdx = payload[0];
    
    if (payload.length >= 65) {
      // Canal configuré: [idx(1)] [name(32)] [secret(32)]
      const nameBytes = payload.slice(1, 33);
      const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
      const secret = payload.slice(33, 65);
      
      console.log(`[BleGateway] Canal ${channelIdx} info: "${name}" (configuré)`);
      
      this.channelConfigs.set(channelIdx, {
        index: channelIdx,
        name,
        secret,
        configured: name.length > 0
      });
    } else {
      console.log(`[BleGateway] Canal ${channelIdx} non configuré (payload: ${payload.length} bytes)`);
    }
  }

  private parsePushAdvert(payload: Uint8Array): void {
    if (payload.length < 32) {
      console.warn('[BleGateway] PUSH_ADVERT trop court:', payload.length);
      return;
    }
    const pubkeyBytes = payload.slice(0, 32);
    const pubkeyHex = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pubkeyPrefix = pubkeyHex.slice(0, 12);
    if (__DEV__) console.log(`[BleGateway] PUSH_ADVERT: ${pubkeyPrefix.slice(0, 6)}...`);
    const contact: MeshCoreContact = {
      publicKey: pubkeyBytes, pubkeyHex, pubkeyPrefix,
      name: `Node-${pubkeyPrefix.slice(0, 6).toUpperCase()}`,
      lastSeen: Math.floor(Date.now() / 1000),
    };
    this.contactDiscoveredCallback?.(contact);
  }

  private parseSendConfirmed(payload: Uint8Array): void {
    if (payload.length < 8) return;
    const view = new DataView(payload.buffer, payload.byteOffset);
    const ackCode    = view.getUint32(0, true);
    const roundTripMs = view.getUint32(4, true);
    
    console.log(`[BleGateway] ✓✓✓ PUSH_SEND_CONFIRMED`);
    console.log(`[BleGateway]    ACK Code: ${ackCode}`);
    console.log(`[BleGateway]    Round-trip: ${roundTripMs}ms`);
    console.log(`[BleGateway]    Le message a été relayé avec succès sur le réseau LoRa!`);
    
    this.sendConfirmedCallback?.(ackCode, roundTripMs);
  }

  private parseContact(payload: Uint8Array): void {
    if (payload.length < 147) {
      console.warn('[BleGateway] RESP_CONTACT trop court:', payload.length);
      return;
    }
    const pubkeyBytes = payload.slice(0, 32);
    const pubkeyHex = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pubkeyPrefix = pubkeyHex.slice(0, 12);
    const nameBytes = payload.slice(99, 131);
    const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim()
      || `Node-${pubkeyPrefix.slice(0, 6).toUpperCase()}`;
    const view = new DataView(payload.buffer, payload.byteOffset);
    const lastAdvert = view.getUint32(131, true);
    const latRaw     = view.getInt32(135, true);
    const lonRaw     = view.getInt32(139, true);
    const contact: MeshCoreContact = {
      publicKey: pubkeyBytes, pubkeyHex, pubkeyPrefix, name,
      lastSeen: lastAdvert,
      lat: latRaw !== 0 ? latRaw / 1e7 : undefined,
      lng: lonRaw !== 0 ? lonRaw / 1e7 : undefined,
    };
    this.pendingContacts.push(contact);
    this.contactDiscoveredCallback?.(contact);
  }

  // ── Privé : gateway relay mode ──────────────────────────────────

  private deliverRawPacket(rawBytes: Uint8Array): void {
    if (!this.messageHandler) return;
    try {
      const packet = decodeMeshCorePacket(rawBytes);
      if (packet) this.messageHandler(packet);
    } catch (err) {
      console.error('[BleGateway] Décodage paquet LoRa:', err);
    }
  }

  // ── Privé : BLE write ───────────────────────────────────────────

  private async sendFrame(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');

    const frame = new Uint8Array(1 + payload.length);
    frame[0] = cmd;
    frame.set(payload, 1);

    const hex = Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ');
    if (__DEV__ && frame.length > 50) {
      console.log(`[BleGateway] TX Frame [${frame.length} bytes]: ${hex.substring(0, 60)}...`);
    }
    
    for (let offset = 0; offset < frame.length; offset += BLE_MAX_WRITE) {
      const chunk = Array.from(frame.slice(offset, offset + BLE_MAX_WRITE));
      if (this.canWriteWithoutResponse) {
        await BleManager.writeWithoutResponse(
          this.connectedId, SERVICE_UUID, TX_UUID, chunk, BLE_MAX_WRITE
        );
      } else {
        await BleManager.write(
          this.connectedId, SERVICE_UUID, TX_UUID, chunk, BLE_MAX_WRITE
        );
      }
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _instance: BleGatewayClient | null = null;

export function getBleGatewayClient(): BleGatewayClient {
  if (!_instance) _instance = new BleGatewayClient();
  return _instance;
}
