/**
 * BLE Gateway Client — MeshCore Companion Protocol
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
 * Séquence connexion (meshcore_connector.dart) :
 *   1. connect() + requestMTU(185)
 *   2. retrieveServices() → vérif NUS UUID
 *   3. startNotification() × 3 retries (0ms, 500ms, 1000ms)
 *   4. _requestDeviceInfo() :
 *        DeviceQuery(22) → AppStart(1) → GetCustomVar(40) → GetBattAndStorage(20)
 *        + retry AppStart toutes les 3500ms jusqu'à SelfInfo reçu
 *   5. waitForSelfInfo(3s) — si échec → retry complet
 *   6. syncTime() auto dans parseSelfInfo
 *   7. getChannels() [unawaited]
 *   8. getContacts() [unawaited]
 *   9. sendSelfAdvert() [unawaited]
 */

import BleManager from 'react-native-ble-manager';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';
import { MeshCoreProtocolTLV, CMD_SET_CHANNEL_TLV } from './meshcore-protocol-tlv';

// ── Nordic UART Service UUIDs ──────────────────────────────────────────
const SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID; // 6e400001-b5a3-f393-e0a9-e50e24dcca9e
const TX_UUID      = MESHCORE_BLE.TX_CHAR_UUID; // 6e400002  App → Device (WRITE)
const RX_UUID      = MESHCORE_BLE.RX_CHAR_UUID; // 6e400003  Device → App (NOTIFY)

// ── Commandes App → Device (meshcore_protocol.dart) ───────────────────
const CMD_APP_START          = 1;
const CMD_SEND_TXT_MSG       = 2;
const CMD_SEND_CHAN_MSG       = 3;
const CMD_GET_CONTACTS       = 4;
const CMD_SET_TIME           = 6;
const CMD_SEND_SELF_ADV      = 7;
const CMD_SYNC_NEXT_MSG      = 10;
const CMD_GET_BATT_STORAGE   = 20;  // cmdGetBattAndStorage
const CMD_DEVICE_QUERY       = 22;
const CMD_SEND_RAW           = 25;
const CMD_GET_CHANNEL        = 31;  // cmdGetChannel (index)
// CMD_SET_CHANNEL = 32 (0x20) utilisé via CMD_SET_CHANNEL_TLV importé de meshcore-protocol-tlv
const CMD_GET_CUSTOM_VAR     = 40;  // cmdGetCustomVar

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
const PUSH_NEW_ADVERT       = 0x8A; // même format que RESP_CONTACT

const APP_PROTOCOL_VERSION = 3;
const RAW_PUSH_HEADER_SIZE = 3;
const BLE_MAX_WRITE        = 182; // MTU 185 − 3 bytes overhead ATT

// Canal 0 (public) — configuré automatiquement au handshake
const DEFAULT_CHANNEL_NAME   = 'public';
const DEFAULT_CHANNEL_SECRET = new Uint8Array(16); // 16 zéros = canal public v1.13

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

  // Configuration des canaux (v1.13.0)
  private channelConfigs: Map<number, ChannelConfig> = new Map();

  // Handshake SelfInfo — retry toutes les 3500ms (meshcore_connector.dart)
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

  // ── Connect — séquence EXACTE meshcore_connector.dart ────────────

  async connect(deviceId: string): Promise<void> {
    // Nettoyer toute connexion précédente
    this.listeners.forEach(l => l.remove());
    this.listeners = [];
    this.clearSelfInfoRetry();
    this.selfInfoResolvers = [];
    this.awaitingSelfInfo = false;
    this.canWriteWithoutResponse = false;
    this.channelConfigs.clear();

    console.log(`[BleGateway] Connexion à ${deviceId}...`);

    // ── 1. Connexion BLE link layer (timeout 15s comme l'officiel) ──
    await BleManager.connect(deviceId);
    this.connectedId = deviceId;
    console.log('[BleGateway] Connecté');

    // ── 2. MTU 185 ──
    try {
      const mtu = await BleManager.requestMTU(deviceId, 185);
      console.log(`[BleGateway] MTU: ${mtu}`);
    } catch {
      console.log('[BleGateway] MTU ignoré');
    }

    // ── 3. Découverte services + check NUS UUID ──
    // PeripheralInfo.serviceUUIDs = string[]   (chemin rapide)
    // PeripheralInfo.services     = Service[]  = { uuid: string }[]  (fallback)
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

    // Détecter WriteWithoutResponse sur le char TX (6e400002)
    const allChars: any[] = services.characteristics || [];
    for (const char of allChars) {
      const uuid = (char.characteristic || char.uuid || '').toLowerCase();
      if (uuid === TX_UUID.toLowerCase() || uuid.startsWith('6e400002')) {
        this.canWriteWithoutResponse = !!char.properties?.WriteWithoutResponse;
        break;
      }
    }
    console.log(`[BleGateway] WriteWithoutResponse: ${this.canWriteWithoutResponse}`);

    // ── 4. startNotification × 3 retries (0ms / 500ms / 1000ms) ──
    let notifySet = false;
    for (let attempt = 0; attempt < 3 && !notifySet; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
        await BleManager.startNotification(deviceId, SERVICE_UUID, RX_UUID);
        notifySet = true;
        console.log(`[BleGateway] Notifications activées (attempt ${attempt + 1})`);
        // Délai 500ms pour que le firmware active ses handlers avant la première commande
        // (meshcore_connector.dart: Future.delayed(const Duration(milliseconds: 500)))
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`[BleGateway] startNotification ${attempt + 1}/3 échoué`);
        if (attempt === 2) throw e;
      }
    }

    // ── 5. Listeners événements — API v12 TurboModule (pas NativeEventEmitter) ──
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

    // ── 6. _requestDeviceInfo() — ordre exact de l'officiel ──
    this.awaitingSelfInfo = true;
    await this.sendFrame(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
    await this.sendAppStart();
    await this.sendFrame(CMD_GET_CUSTOM_VAR, new Uint8Array(0));
    await this.sendFrame(CMD_GET_BATT_STORAGE, new Uint8Array(0));
    this.scheduleSelfInfoRetry(); // re-envoie AppStart toutes les 3500ms

    // ── 7. waitForSelfInfo(3s) — si non reçu → retry ──
    const gotSelfInfo = await this.waitForSelfInfo(3000);
    if (!gotSelfInfo) {
      console.log('[BleGateway] SelfInfo non reçu — retry requestDeviceInfo...');
      await this.sendFrame(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
      await this.sendAppStart();
      await this.waitForSelfInfo(3000);
    }

    // ── 8. Configuration canal 0 (public) — requis en v1.13.0 pour broadcast ──
    await this.configureDefaultChannels();

    // ── 9. getChannels() — unawaited comme l'officiel ──
    this.getChannels().catch(e => console.warn('[BleGateway] getChannels:', e));

    // ── 10. getContacts() ──
    this.getContacts().catch(e => console.warn('[BleGateway] getContacts:', e));

    // ── 11. sendSelfAdvert() ──
    this.sendSelfAdvert(1).catch(e => console.warn('[BleGateway] SelfAdvert:', e));

    console.log('[BleGateway] Handshake terminé');
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

  // ── SelfInfo retry — scheduleSelfInfoRetry (meshcore_connector.dart) ──

  private async sendAppStart(): Promise<void> {
    // Format officiel : [version(1)][reserved(6)][app_name\0]
    // CORRECTION v1.13.0 : version = APP_PROTOCOL_VERSION (3), pas 0x01
    const appNameBytes = new TextEncoder().encode('BitMesh\0');
    const payload = new Uint8Array(1 + 6 + appNameBytes.length);
    payload[0] = APP_PROTOCOL_VERSION; // 3 (pas 0x01 !)
    // bytes 1-6 : reserved (0x00)
    payload.set(appNameBytes, 7);
    await this.sendFrame(CMD_APP_START, payload);
    console.log('[BleGateway] AppStart envoyé (v' + APP_PROTOCOL_VERSION + ')');
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
      // Déclarer resolver EN PREMIER — le timer le référence par closure
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
    payload[off++] = 0x00;
    payload[off++] = attempt & 0xFF;
    new DataView(payload.buffer).setUint32(off, ts, true); off += 4;
    payload.set(pubkeyPrefix6.slice(0, 6), off); off += 6;
    payload.set(textBytes, off);
    const prefixHex = Array.from(pubkeyPrefix6.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`[BleGateway] CMD_SEND_TXT_MSG prefix=${prefixHex}...`);
    await this.sendFrame(CMD_SEND_TXT_MSG, payload);
  }

  async sendChannelMessage(channelIdx: number, text: string): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');

    // v1.13.0 : vérifier que le canal est configuré avant envoi, auto-config si absent
    const channelConfig = this.channelConfigs.get(channelIdx);
    if (!channelConfig?.configured) {
      console.warn(`[BleGateway] Canal ${channelIdx} non configuré, auto-config...`);
      const defaultName   = channelIdx === 0 ? 'public' : `channel${channelIdx}`;
      const defaultSecret = new Uint8Array(16); // 16 zéros = PSK par défaut
      await this.setChannel(channelIdx, defaultName, defaultSecret);
    }

    const ts = Math.floor(Date.now() / 1000);
    const textBytes = new TextEncoder().encode(text);
    if (textBytes.length > 150) {
      throw new Error(`Message trop long: ${textBytes.length} bytes (max 150)`);
    }
    const payload = new Uint8Array(2 + 4 + textBytes.length);
    let off = 0;
    payload[off++] = 0x00; // txtType = plain
    payload[off++] = channelIdx & 0xFF;
    new DataView(payload.buffer).setUint32(off, ts, true); off += 4;
    payload.set(textBytes, off);
    console.log(`[BleGateway] CMD_SEND_CHAN_MSG ch${channelIdx}: "${text.substring(0, 40)}"`);
    await this.sendFrame(CMD_SEND_CHAN_MSG, payload);
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

  /**
   * getChannels — séquence exacte : cmdGetChannel(31) × 8
   * Requête canal par canal avec 400ms entre chaque (firmware ESP32 lent à répondre)
   */
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

  // ── v1.13.0 : Configuration des canaux ──────────────────────────

  /**
   * Configure le canal 0 (public) automatiquement après le handshake.
   * Requis en v1.13.0 pour recevoir/envoyer des messages de broadcast.
   */
  private async configureDefaultChannels(): Promise<void> {
    console.log('[BleGateway] Configuration canal 0 (public)...');
    try {
      await this.setChannel(0, DEFAULT_CHANNEL_NAME, DEFAULT_CHANNEL_SECRET);
      console.log('[BleGateway] Canal 0 (public) configuré');
    } catch (err) {
      console.warn('[BleGateway] configureDefaultChannels échoué:', err);
    }
  }

  /**
   * Configure un canal (CMD_SET_CHANNEL = 0x20) — v1.13.0
   *
   * Format TLV : [opcode(1)][0x00(1)][len_lo(1)][len_hi(1)][TLV payload...]
   * Envoyé directement (sans le header cmd supplémentaire de sendFrame).
   */
  async setChannel(channelIdx: number, name: string, secret: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    if (channelIdx < 0 || channelIdx > 7) throw new Error(`Index canal invalide: ${channelIdx}`);

    const tlvPayload = MeshCoreProtocolTLV.encodeChannelConfig(name);
    const packet = MeshCoreProtocolTLV.buildPacket(CMD_SET_CHANNEL_TLV, tlvPayload);

    console.log(`[BleGateway] setChannel ${channelIdx} "${name}" (TLV ${packet.length}B)`);

    // Envoi direct (pas via sendFrame qui ajouterait un byte de commande en trop)
    await BleManager.writeWithoutResponse(
      this.connectedId, SERVICE_UUID, TX_UUID,
      Array.from(packet), BLE_MAX_WRITE
    );

    this.channelConfigs.set(channelIdx, {
      index: channelIdx,
      name,
      secret: secret.slice(0, 16),
      configured: true,
    });
  }

  // ── Envoi paquet gateway relay mode ─────────────────────────────

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
  getChannelConfig(index: number): ChannelConfig | undefined { return this.channelConfigs.get(index); }
  getConnectedDevice(): BleGatewayDevice | null {
    if (!this.connectedId) return null;
    return { id: this.connectedId, name: this.deviceInfo?.name || 'MeshCore', rssi: -70 };
  }

  async destroy(): Promise<void> { await this.disconnect(); }

  // ── Privé : Frame handler ───────────────────────────────────────

  private handleFrame(data: Uint8Array): void {
    if (data.length === 0) return;
    const code = data[0];
    const payload = data.slice(1);
    console.log(`[BleGateway] Frame reçu code=0x${code.toString(16)} (${payload.length}B)`);

    switch (code) {
      case RESP_OK:
        break;
      case 0x01:
        // RESP_ERR ou ACK implicite à AppStart — ne pas traiter comme erreur
        console.log('[BleGateway] Frame 0x01 reçu (ERR/ACK AppStart)');
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
      case PUSH_NEW_ADVERT:        // même format que RESP_CONTACT
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
        console.log('[BleGateway] RESP_SENT');
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
          console.log(`[BleGateway] RawData SNR:${snr} RSSI:${rssi} (${raw.length}B)`);
          this.deliverRawPacket(raw);
        }
        break;
      default:
        console.log(`[BleGateway] Code non géré 0x${code.toString(16)}`);
    }
  }

  // ── Privé : SelfInfo parser (auto-detect offset pour v1.12/v1.13) ──

  private parseSelfInfo(payload: Uint8Array): void {
    if (payload.length < 48) {
      console.warn('[BleGateway] SelfInfo trop court:', payload.length);
      return;
    }
    const view = new DataView(payload.buffer, payload.byteOffset);
    let off = 0;
    /* type */      off++;
    const txPower = payload[off++];
    /* maxTx */     off++;
    /* flags */     off++; // byte supplémentaire présent en v1.12+

    const pubkeyBytes = payload.slice(off, off + 32); off += 32;
    const publicKey   = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const advLatRaw = view.getInt32(off, true);  off += 4;
    const advLonRaw = view.getInt32(off, true);  off += 4;
    // off = 44 ici (après lat/lon)

    // Auto-detect : le firmware v1.13.0 peut avoir des champs supplémentaires
    // avant les paramètres radio → on cherche la première valeur de fréquence valide
    const candidateOffsets = [44, 48, 52, 40, 56];
    let radioOffset = 48; // défaut v1.12 (avec reserved+manual = 4 bytes)
    let bestScore = 0;

    for (const testOff of candidateOffsets) {
      if (testOff + 10 > payload.length) continue;
      const testFreq = view.getUint32(testOff, true);
      const testBw   = view.getUint32(testOff + 4, true);
      const testSf   = payload[testOff + 8];
      const testCr   = payload[testOff + 9];
      let score = 0;
      // Fréquence LoRa valide (400 MHz – 1 GHz)
      if (testFreq >= 400_000_000 && testFreq <= 1_000_000_000) score += 100;
      // Bandwidth connue (kHz)
      if ([125000, 250000, 500000, 62500].includes(testBw)) score += 20;
      // SF valide 7-12
      if (testSf >= 7 && testSf <= 12) score += 20;
      // CR valide 5-8
      if (testCr >= 5 && testCr <= 8) score += 10;
      if (score > bestScore) { bestScore = score; radioOffset = testOff; }
    }

    const radioFreqHz = view.getUint32(radioOffset,     true);
    const radioBwHz   = view.getUint32(radioOffset + 4, true);
    const radioSf     = payload[radioOffset + 8];
    const radioCr     = payload[radioOffset + 9];
    const nameRaw     = payload.slice(radioOffset + 10);
    const name        = new TextDecoder().decode(nameRaw).replace(/\0/g, '').trim() || 'MeshCore';

    const info: BleDeviceInfo = {
      name, publicKey, txPower, radioFreqHz, radioBwHz, radioSf, radioCr,
      advLat: advLatRaw / 1e7, advLon: advLonRaw / 1e7,
    };
    this.deviceInfo = info;
    console.log('[BleGateway] SelfInfo:', {
      name,
      freq: `${(radioFreqHz / 1_000_000).toFixed(3)} MHz`,
      sf: radioSf, bw: radioBwHz, cr: radioCr, txPower,
      radioOffset,
    });

    if (this.deviceInfoCallback) this.deviceInfoCallback(info);

    // SetTime automatique (syncTime dans l'officiel)
    const ts = Math.floor(Date.now() / 1000);
    const timeBuf = new Uint8Array(4);
    new DataView(timeBuf.buffer).setUint32(0, ts, true);
    this.sendFrame(CMD_SET_TIME, timeBuf)
      .then(() => console.log('[BleGateway] SetTime envoyé:', ts))
      .catch(e => console.warn('[BleGateway] SetTime:', e));

    // Notifier waitForSelfInfo() — arrêter le retry timer
    this.awaitingSelfInfo = false;
    this.clearSelfInfoRetry();
    const resolvers = [...this.selfInfoResolvers];
    this.selfInfoResolvers = [];
    resolvers.forEach(r => r());
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
    console.log(`[BleGateway] RESP_DIRECT_MSG_V3 SNR:${snr}dB hops:${pathLen}`);
    this.incomingMessageCallback?.({ type: 'direct', senderPubkeyPrefix, pathLen, timestamp, text, snr });
  }

  private parseChannelMsgV3(payload: Uint8Array): void {
    if (payload.length < 10) {
      console.warn('[BleGateway] RESP_CHANNEL_MSG_V3 trop court:', payload.length);
      return;
    }
    const snrByte = payload[0];
    const channelIdx = payload[3];
    const pathLen = payload[4];
    const view = new DataView(payload.buffer, payload.byteOffset);
    const timestamp = view.getUint32(6, true);
    const text = new TextDecoder().decode(payload.slice(10)).replace(/\0/g, '');
    const snr = snrByte / 4.0;
    console.log(`[BleGateway] RESP_CHANNEL_MSG_V3 ch${channelIdx} SNR:${snr}dB`);
    this.incomingMessageCallback?.({ type: 'channel', channelIdx, senderPubkeyPrefix: '', pathLen, timestamp, text, snr });
  }

  /**
   * Parser RESP_CHANNEL_INFO (0x12)
   * v1.12 : [idx(1)][name(32)][secret(32)] = 65 bytes
   * v1.13 : [idx(1)][name(32)][psk_hash(16)] = 49 bytes
   */
  private parseChannelInfo(payload: Uint8Array): void {
    if (payload.length < 1) { console.warn('[BleGateway] RESP_CHANNEL_INFO vide'); return; }
    const channelIdx = payload[0];
    if (payload.length >= 49) {
      const nameBytes = payload.slice(1, 33);
      const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
      const secretLen = payload.length >= 65 ? 32 : 16; // v1.12 = 32, v1.13 = 16
      const secret = payload.slice(33, 33 + secretLen);
      console.log(`[BleGateway] RESP_CHANNEL_INFO ch${channelIdx} "${name}" (${secretLen}B secret)`);
      this.channelConfigs.set(channelIdx, {
        index: channelIdx, name, secret, configured: name.length > 0,
      });
      // Si SelfInfo n'est pas encore arrivé, stopper le retry (connexion fonctionnelle)
      if (this.awaitingSelfInfo) {
        console.log('[BleGateway] ChannelInfo reçu → SelfInfo retry arrêté');
        this.awaitingSelfInfo = false;
        this.clearSelfInfoRetry();
        this.selfInfoResolvers.forEach(r => r());
        this.selfInfoResolvers = [];
      }
    } else {
      console.log(`[BleGateway] RESP_CHANNEL_INFO ch${channelIdx} non configuré (${payload.length}B)`);
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
    console.log(`[BleGateway] PUSH_ADVERT: ${pubkeyPrefix}...`);
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
    console.log(`[BleGateway] PUSH_SEND_CONFIRMED ACK:${ackCode} RTT:${roundTripMs}ms`);
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
  //
  // Préfère writeWithoutResponse si supporté (comme l'app officielle Flutter).
  // Fallback sur write avec réponse sinon.

  private async sendFrame(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');

    const frame = new Uint8Array(1 + payload.length);
    frame[0] = cmd;
    frame.set(payload, 1);

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
