/**
 * BLE Gateway Client — MeshCore Companion Protocol
 *
 * Bibliothèque : react-native-ble-manager (v12+)
 * Avantage clé vs react-native-ble-plx : createBond() explicite +
 * événement BleManagerBondingComplete → bonding MITM fiable.
 *
 * Source de vérité :
 *   https://github.com/zjs81/meshcore-open  (Flutter officiel)
 *   https://github.com/meshcore-dev/MeshCore/src/helpers/esp32/SerialBLEInterface.cpp
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PROTOCOLE BLE — Nordic UART Service (NUS)                          ║
 * ║  Chaque write/notification = UN frame complet. Pas de framing USB.  ║
 * ║  App → Device : [cmd][payload...]   sur 6e400002 (RX/write)         ║
 * ║  Device → App : [code][data...]     sur 6e400003 (TX/notify)        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Séquence connexion (cf. meshcore_connector.dart) :
 *   1. connect() + requestMTU(185)
 *   2. retrieveServices()
 *   3. createBond()  ← bonding explicite avant toute écriture
 *   4. startNotification() sur TX (6e400003)
 *   5. DeviceQuery  (cmd=22)
 *   6. AppStart     (cmd=1)  → device répond SelfInfo (code=5)
 *   7. SetTime      (cmd=6)  envoyé auto dans parseSelfInfo
 *   8. SelfAdvert   (cmd=7)  broadcaster présence dans mesh
 *   9. GetContacts  (cmd=4)  charger contacts du device
 */

import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules } from 'react-native';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';

// ── Nordic UART Service UUIDs ──────────────────────────────────────────
// Source : meshcore-open MeshCoreUuids + SerialBLEInterface.cpp (confirmés)
const SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID; // 6e400001-b5a3-f393-e0a9-e50e24dcca9e
const TX_UUID      = MESHCORE_BLE.TX_CHAR_UUID; // 6e400002  App → Device (WRITE)
const RX_UUID      = MESHCORE_BLE.RX_CHAR_UUID; // 6e400003  Device → App (NOTIFY)

// ── Command codes (App → Device) ──────────────────────────────────────
const CMD_APP_START    = 1;    // Handshake principal
const CMD_SEND_TXT_MSG = 0x02; // DM natif avec routing firmware
const CMD_SEND_CHAN_MSG = 0x03; // Channel message natif
const CMD_GET_CONTACTS = 0x04; // Lister contacts du device
const CMD_SET_TIME     = 6;    // Sync horloge après SelfInfo
const CMD_SEND_SELF_ADV = 0x07; // Broadcaster présence dans mesh
const CMD_SYNC_NEXT_MSG = 0x0A; // Fetch messages en queue device
const CMD_DEVICE_QUERY = 22;   // Premier message (version protocole)
const CMD_SEND_RAW     = 25;   // Broadcast raw bytes sur LoRa (gateway relay mode)

// ── Response / push codes (Device → App) ──────────────────────────────
const RESP_OK            = 0;
const RESP_CONTACTS_START = 0x02; // Début liste contacts (uint32 LE = count)
const RESP_CONTACT        = 0x03; // 1 contact (148 bytes)
const RESP_END_CONTACTS   = 0x04; // Fin liste contacts
const RESP_SELF_INFO      = 5;    // Public key, radio params, nom
const RESP_SENT           = 0x06; // Confirme envoi + tag ACK
const RESP_DIRECT_MSG     = 0x07; // DM reçu (v2, sans SNR)
const RESP_CHANNEL_MSG    = 0x08; // Channel reçu (v2, sans SNR)
const RESP_NO_MORE_MSGS   = 0x0A; // Plus de messages en queue
const RESP_DEVICE_INFO    = 13;   // Firmware/model
const RESP_DIRECT_MSG_V3  = 0x10; // DM reçu (v3, avec SNR)
const RESP_CHANNEL_MSG_V3 = 0x11; // Channel reçu (v3, avec SNR)
const PUSH_ADVERT         = 0x80; // Nœud découvert (pubkey 32B)
const PUSH_SEND_CONFIRMED = 0x82; // ACK reçu (ackCode:4 LE + roundTrip:4 LE)
const PUSH_MSG_WAITING    = 0x83; // Message en attente → syncNextMessage()
const PUSH_RAW_DATA       = 0x84; // Données LoRa reçues (gateway relay mode)

const APP_PROTOCOL_VERSION = 3;
const RAW_PUSH_HEADER_SIZE = 3; // [snr:int8][rssi:int8][reserved:uint8]

// MTU device = 172 → ATT data max = 172 - 3 = 169 bytes
const BLE_MAX_WRITE = 169;

// ── Types publics ──────────────────────────────────────────────────────

export interface BleGatewayDevice {
  id: string;
  name: string;
  rssi: number;
  type?: 'gateway' | 'companion';
}

export interface BleGatewayState {
  connected: boolean;
  device: BleGatewayDevice | null;
  scanning: boolean;
  error: string | null;
}

export interface BleDeviceInfo {
  name: string;
  publicKey: string;   // hex 64 chars (32 bytes)
  txPower: number;     // dBm
  radioFreqHz: number; // Hz
  radioBwHz: number;   // Hz
  radioSf: number;
  radioCr: number;
  advLat: number;
  advLon: number;
}

export interface MeshCoreContact {
  publicKey: Uint8Array;    // 32 bytes Ed25519
  pubkeyHex: string;        // hex 64 chars
  pubkeyPrefix: string;     // hex 12 chars (6 bytes, pour envoi DM)
  name: string;
  lastSeen: number;
  lat?: number;
  lng?: number;
}

export interface MeshCoreIncomingMsg {
  type: 'direct' | 'channel';
  channelIdx?: number;
  senderPubkeyPrefix: string; // hex 12 chars (6 bytes)
  pathLen: number;            // 0xFF = direct radio, sinon nb hops
  timestamp: number;
  text: string;
  snr?: number;               // dB (snr_byte / 4.0)
}

type MessageHandler = (packet: MeshCorePacket) => void;

// ── BleGatewayClient ──────────────────────────────────────────────────

export class BleGatewayClient {
  private connectedId: string | null = null;
  private messageHandler: MessageHandler | null = null;
  private deviceInfo: BleDeviceInfo | null = null;
  private deviceInfoCallback: ((info: BleDeviceInfo) => void) | null = null;
  private listeners: ReturnType<NativeEventEmitter['addListener']>[] = [];
  private emitter: NativeEventEmitter;

  // Callbacks pour le protocole natif MeshCore Companion
  private incomingMessageCallback: ((msg: MeshCoreIncomingMsg) => void) | null = null;
  private contactDiscoveredCallback: ((contact: MeshCoreContact) => void) | null = null;
  private contactsCallback: ((contacts: MeshCoreContact[]) => void) | null = null;
  private sendConfirmedCallback: ((ackCode: number, roundTripMs: number) => void) | null = null;
  private pendingContacts: MeshCoreContact[] = [];

  constructor() {
    this.emitter = new NativeEventEmitter(NativeModules.BleManager);
  }

  // ── Initialisation ────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await BleManager.start({ showAlert: false });
    console.log('[BleGateway] BleManager démarré');
  }

  // ── Scan ──────────────────────────────────────────────────────────

  /**
   * Scan BLE actif — montre TOUS les appareils (filtre par nom ensuite).
   * meshcore-open scanne sans filtre de service UUID (plus fiable sur Android
   * car certains firmware mettent le UUID dans le scan response, pas l'ADV).
   */
  async scanForGateways(
    onDeviceFound: (device: BleGatewayDevice) => void,
    timeoutMs = 10000
  ): Promise<void> {
    console.log('[BleGateway] Scan BLE actif...');
    const seen = new Set<string>();

    const listener = this.emitter.addListener(
      'BleManagerDiscoverPeripheral',
      (peripheral: any) => {
        const name: string =
          peripheral.name ||
          peripheral.advertising?.localName ||
          '';

        if (seen.has(peripheral.id) && !name) return;
        seen.add(peripheral.id);

        const displayName = name || `BLE (${peripheral.id.slice(0, 8)})`;
        const isMeshCore =
          displayName.startsWith('MeshCore-') ||
          displayName.startsWith('Whisper-');

        console.log(`[BleGateway] Trouvé: "${displayName}" RSSI ${peripheral.rssi}`);

        onDeviceFound({
          id: peripheral.id,
          name: displayName,
          rssi: peripheral.rssi || -100,
          type: isMeshCore ? 'companion' : 'gateway',
        });
      }
    );

    // Scan sans filtre UUID (plus fiable sur Android)
    await BleManager.scan({
      serviceUUIDs: [],
      seconds: timeoutMs / 1000,
      allowDuplicates: false,
    });

    await new Promise((res) => setTimeout(res, timeoutMs));
    await BleManager.stopScan();
    listener.remove();
    console.log(`[BleGateway] Scan terminé — ${seen.size} device(s)`);
  }

  stopScan(): void {
    BleManager.stopScan();
  }

  // ── Connect ──────────────────────────────────────────────────────

  /**
   * Connexion + bonding explicite + handshake MeshCore.
   *
   * Séquence identique à meshcore_connector.dart :
   *   connect → requestMTU → retrieveServices → createBond → startNotification
   *   → DeviceQuery → AppStart → (SelfInfo → SetTime auto) → SelfAdvert → GetContacts
   */
  async connect(deviceId: string, timeoutMs = 60000): Promise<void> {
    console.log(`[BleGateway] Connexion à ${deviceId}...`);

    // ── 1. Connexion BLE (link layer) ──
    await BleManager.connect(deviceId);
    this.connectedId = deviceId;
    console.log('[BleGateway] Connecté');

    // ── 2. MTU 185 (comme meshcore-open) ──
    try {
      const mtu = await BleManager.requestMTU(deviceId, 185);
      console.log(`[BleGateway] MTU négocié : ${mtu}`);
    } catch {
      console.log('[BleGateway] MTU request ignoré');
    }

    // ── 3. Découverte des services ──
    const services = await BleManager.retrieveServices(deviceId) as any;
    const hasUart = (services.services as string[])?.some(
      (s: string) => s.toLowerCase() === SERVICE_UUID.toLowerCase()
    );
    if (!hasUart) {
      await BleManager.disconnect(deviceId);
      this.connectedId = null;
      throw new Error(
        'Service Nordic UART non trouvé. Vérifiez que c\'est bien un firmware MeshCore Companion BLE.'
      );
    }
    console.log('[BleGateway] Nordic UART Service trouvé');

    // ── 4. Bonding EXPLICITE ──────────────────────────────────────
    await this.createBondExplicit(deviceId, 60000);

    // ── 5. Activer notifications TX (Device → App) ──
    await BleManager.startNotification(deviceId, SERVICE_UUID, RX_UUID);
    console.log('[BleGateway] Notifications TX activées (6e400003)');

    // Écouter les données entrantes
    const notifListener = this.emitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      (data: any) => {
        if (data.peripheral !== deviceId) return;
        if (data.characteristic?.toLowerCase() !== RX_UUID.toLowerCase()) return;
        this.handleFrame(new Uint8Array(data.value));
      }
    );
    this.listeners.push(notifListener);

    // Écouter déconnexion
    const discListener = this.emitter.addListener(
      'BleManagerDisconnectPeripheral',
      (data: any) => {
        if (data.peripheral === deviceId) {
          console.log('[BleGateway] Device déconnecté');
          this.connectedId = null;
        }
      }
    );
    this.listeners.push(discListener);

    // ── 6. DeviceQuery (cmd=22) ──
    await this.sendFrame(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
    console.log('[BleGateway] DeviceQuery envoyé');
    await new Promise((res) => setTimeout(res, 400));

    // ── 7. AppStart (cmd=1) ──
    const appName = 'BitMesh\0';
    const appNameBytes = new TextEncoder().encode(appName);
    const appStartPayload = new Uint8Array(1 + 6 + appNameBytes.length);
    appStartPayload[0] = 0x01; // app version
    // bytes 1-6 : reserved (0x00)
    appStartPayload.set(appNameBytes, 7);
    await this.sendFrame(CMD_APP_START, appStartPayload);
    console.log('[BleGateway] AppStart envoyé — attente SelfInfo (code=5)...');

    // SetTime envoyé automatiquement dans parseSelfInfo après réception
    await new Promise((res) => setTimeout(res, 5000));

    // ── 8. SelfAdvert — broadcaster présence dans mesh ──
    try {
      await this.sendSelfAdvert(1);
      console.log('[BleGateway] SelfAdvert envoyé');
    } catch (e) {
      console.warn('[BleGateway] SelfAdvert échoué:', e);
    }
    await new Promise((res) => setTimeout(res, 200));

    // ── 9. GetContacts — charger contacts du device ──
    try {
      await this.getContacts();
      console.log('[BleGateway] GetContacts envoyé');
    } catch (e) {
      console.warn('[BleGateway] GetContacts échoué:', e);
    }

    console.log('[BleGateway] Handshake terminé');
  }

  // ── Bonding explicite ────────────────────────────────────────────

  private async createBondExplicit(deviceId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const done = (err?: Error) => {
        if (resolved) return;
        resolved = true;
        bondListener.remove();
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      const timer = setTimeout(() => {
        console.warn('[BleGateway] Bonding timeout (60s) — tentative de continuer...');
        done();
      }, timeoutMs);

      const bondListener = this.emitter.addListener(
        'BleManagerBondingComplete',
        (data: any) => {
          if (data.peripheral !== deviceId) return;
          if (data.status === 'success') {
            console.log('[BleGateway] Bonding réussi');
            done();
          } else {
            console.warn('[BleGateway] Bonding status:', data.status);
            done(new Error(`Bonding échoué : ${data.status}. Vérifiez le PIN (défaut : 123456).`));
          }
        }
      );

      console.log('[BleGateway] createBond() — entrez le PIN dans le dialogue Android...');
      BleManager.createBond(deviceId)
        .then(() => {
          setTimeout(() => done(), 3000);
        })
        .catch((err: any) => {
          const msg = String(err?.message ?? err ?? '').toLowerCase();
          if (msg.includes('already') || msg.includes('bonded') || msg.includes('11')) {
            console.log('[BleGateway] Device déjà bondé');
            done();
          } else {
            done(new Error(msg));
          }
        });
    });
  }

  // ── Disconnect ──────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    this.listeners.forEach((l) => l.remove());
    this.listeners = [];
    if (this.connectedId) {
      console.log('[BleGateway] Déconnexion...');
      await BleManager.disconnect(this.connectedId).catch(() => {});
      this.connectedId = null;
    }
  }

  // ── Envoyer paquet BitMesh (gateway relay mode) ──────────────────

  async sendPacket(packet: MeshCorePacket): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté à un device MeshCore');

    const encoded = encodeMeshCorePacket(packet);
    const payload = new Uint8Array(1 + encoded.length);
    payload[0] = 0x00; // path_length = 0 (broadcast)
    payload.set(encoded, 1);

    console.log(`[BleGateway] sendPacket type=${packet.type} (${encoded.length}B)`);
    await this.sendFrame(CMD_SEND_RAW, payload);
  }

  // ── Protocole natif MeshCore Companion ──────────────────────────

  /**
   * Envoie un DM natif via CMD_SEND_TXT_MSG (0x02).
   * Le firmware chiffre E2E et route multi-hop dans le mesh.
   *
   * Layout payload : [txt_type=0][attempt][timestamp:4 LE][pubkey_prefix:6][text:UTF-8]
   */
  async sendDirectMessage(pubkeyPrefix6: Uint8Array, text: string, attempt = 0): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté à un device MeshCore');

    const ts = Math.floor(Date.now() / 1000);
    const textBytes = new TextEncoder().encode(text);
    const payload = new Uint8Array(2 + 4 + 6 + textBytes.length);
    let off = 0;
    payload[off++] = 0x00;           // txt_type = plain text
    payload[off++] = attempt & 0xFF; // attempt counter
    new DataView(payload.buffer).setUint32(off, ts, true); off += 4;
    payload.set(pubkeyPrefix6.slice(0, 6), off); off += 6;
    payload.set(textBytes, off);

    const prefixHex = Array.from(pubkeyPrefix6.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`[BleGateway] CMD_SEND_TXT_MSG prefix=${prefixHex}... (${textBytes.length}B)`);
    await this.sendFrame(CMD_SEND_TXT_MSG, payload);
  }

  /**
   * Envoie un message sur un channel natif via CMD_SEND_CHAN_TXT_MSG (0x03).
   * ch0 = public (pas de chiffrement firmware), ch1-N = chiffré avec clé partagée.
   *
   * Layout payload : [txt_type=0][channelIdx][timestamp:4 LE][text:UTF-8]
   */
  async sendChannelMessage(channelIdx: number, text: string): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté à un device MeshCore');

    const ts = Math.floor(Date.now() / 1000);
    const textBytes = new TextEncoder().encode(text);
    const payload = new Uint8Array(2 + 4 + textBytes.length);
    let off = 0;
    payload[off++] = 0x00;             // txt_type = plain text
    payload[off++] = channelIdx & 0xFF;
    new DataView(payload.buffer).setUint32(off, ts, true); off += 4;
    payload.set(textBytes, off);

    console.log(`[BleGateway] CMD_SEND_CHAN_MSG ch${channelIdx} (${textBytes.length}B)`);
    await this.sendFrame(CMD_SEND_CHAN_MSG, payload);
  }

  /**
   * Demande au device de transmettre le prochain message en queue.
   * À appeler en réponse à PUSH_MSG_WAITING (0x83).
   */
  async syncNextMessage(): Promise<void> {
    if (!this.connectedId) return;
    await this.sendFrame(CMD_SYNC_NEXT_MSG, new Uint8Array(0));
  }

  /**
   * Broadcaster notre présence dans le mesh (PUSH_ADVERT firmware-side).
   * type=0: advert normal, type=1: advert avec demande de réponse.
   */
  async sendSelfAdvert(type: 0 | 1 = 1): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    await this.sendFrame(CMD_SEND_SELF_ADV, new Uint8Array([type]));
  }

  /**
   * Demande la liste des contacts connus du device MeshCore.
   * Résultat reçu via onContacts() callback.
   */
  async getContacts(): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');
    this.pendingContacts = [];
    await this.sendFrame(CMD_GET_CONTACTS, new Uint8Array(0));
  }

  // ── Handlers publics ────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onDeviceInfo(cb: (info: BleDeviceInfo) => void): void {
    this.deviceInfoCallback = cb;
  }

  onIncomingMessage(cb: (msg: MeshCoreIncomingMsg) => void): void {
    this.incomingMessageCallback = cb;
  }

  onContactDiscovered(cb: (contact: MeshCoreContact) => void): void {
    this.contactDiscoveredCallback = cb;
  }

  onContacts(cb: (contacts: MeshCoreContact[]) => void): void {
    this.contactsCallback = cb;
  }

  onSendConfirmed(cb: (ackCode: number, roundTripMs: number) => void): void {
    this.sendConfirmedCallback = cb;
  }

  getDeviceInfo(): BleDeviceInfo | null {
    return this.deviceInfo;
  }

  isConnected(): boolean {
    return this.connectedId !== null;
  }

  getConnectedDevice(): BleGatewayDevice | null {
    if (!this.connectedId) return null;
    return { id: this.connectedId, name: 'MeshCore', rssi: -70 };
  }

  async destroy(): Promise<void> {
    await this.disconnect();
  }

  // ── Privé : Frame handler ───────────────────────────────────────

  private handleFrame(data: Uint8Array): void {
    if (data.length === 0) return;
    const code = data[0];
    const payload = data.slice(1);
    console.log(`[BleGateway] Frame reçu code=0x${code.toString(16)} (${payload.length}B)`);

    switch (code) {
      case RESP_OK:
        break;
      case RESP_CONTACTS_START: {
        this.pendingContacts = [];
        if (payload.length >= 4) {
          const count = new DataView(payload.buffer, payload.byteOffset).getUint32(0, true);
          console.log(`[BleGateway] Début liste contacts: ${count} attendus`);
        }
        break;
      }
      case RESP_CONTACT:
        this.parseContact(payload);
        break;
      case RESP_END_CONTACTS:
        console.log(`[BleGateway] ${this.pendingContacts.length} contacts chargés depuis device`);
        if (this.contactsCallback) this.contactsCallback([...this.pendingContacts]);
        break;
      case RESP_SELF_INFO:
        this.parseSelfInfo(payload);
        break;
      case RESP_SENT:
        console.log('[BleGateway] RESP_SENT — message transmis au firmware');
        break;
      case RESP_DIRECT_MSG:
        // v2 sans SNR — non implémenté, on attend v3
        console.log('[BleGateway] RESP_DIRECT_MSG (v2) reçu');
        break;
      case RESP_CHANNEL_MSG:
        // v2 sans SNR — non implémenté, on attend v3
        console.log('[BleGateway] RESP_CHANNEL_MSG (v2) reçu');
        break;
      case RESP_NO_MORE_MSGS:
        console.log('[BleGateway] RESP_NO_MORE_MSGS — queue vide');
        break;
      case RESP_DEVICE_INFO:
        console.log('[BleGateway] DeviceInfo reçu');
        break;
      case RESP_DIRECT_MSG_V3:
        this.parseDirectMsgV3(payload);
        break;
      case RESP_CHANNEL_MSG_V3:
        this.parseChannelMsgV3(payload);
        break;
      case PUSH_ADVERT:
        this.parsePushAdvert(payload);
        break;
      case PUSH_SEND_CONFIRMED:
        this.parseSendConfirmed(payload);
        break;
      case PUSH_MSG_WAITING:
        console.log('[BleGateway] PUSH_MSG_WAITING → syncNextMessage()');
        this.syncNextMessage().catch((e) => console.warn('[BleGateway] syncNextMessage échoué:', e));
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

  // ── Privé : SelfInfo parser ─────────────────────────────────────

  private parseSelfInfo(payload: Uint8Array): void {
    if (payload.length < 58) {
      console.warn('[BleGateway] SelfInfo trop court:', payload.length);
      return;
    }
    const view = new DataView(payload.buffer, payload.byteOffset);
    let off = 0;

    /* type */      off++;
    const txPower = payload[off++];
    /* maxTx */     off++;
    /* flags */     off++;

    const pubkeyBytes = payload.slice(off, off + 32); off += 32;
    const publicKey   = Array.from(pubkeyBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const advLatRaw = view.getInt32(off, true);  off += 4;
    const advLonRaw = view.getInt32(off, true);  off += 4;
    off += 4; // reserved+manualAddContacts

    const radioFreqHz = view.getUint32(off, true); off += 4;
    const radioBwHz   = view.getUint32(off, true); off += 4;
    const radioSf     = payload[off++];
    const radioCr     = payload[off++];

    const nameRaw = payload.slice(off);
    const name = new TextDecoder().decode(nameRaw).replace(/\0/g, '').trim() || 'MeshCore';

    const info: BleDeviceInfo = {
      name, publicKey, txPower, radioFreqHz, radioBwHz, radioSf, radioCr,
      advLat: advLatRaw / 1e7,
      advLon: advLonRaw / 1e7,
    };
    this.deviceInfo = info;
    console.log('[BleGateway] SelfInfo:', { name, freq: radioFreqHz, sf: radioSf, txPower });

    if (this.deviceInfoCallback) this.deviceInfoCallback(info);

    // SetTime (cmd=6) — obligatoire après SelfInfo
    const ts = Math.floor(Date.now() / 1000);
    const timeBuf = new Uint8Array(4);
    new DataView(timeBuf.buffer).setUint32(0, ts, true);
    this.sendFrame(CMD_SET_TIME, timeBuf)
      .then(() => console.log('[BleGateway] SetTime envoyé:', ts))
      .catch((e) => console.warn('[BleGateway] SetTime échoué:', e));
  }

  // ── Privé : Parsers messages natifs ─────────────────────────────

  /**
   * RESP_DIRECT_MSG_V3 (0x10) layout :
   *   [snr:1][reserved:2][pubkey_prefix:6][path_len:1][txt_type:1][timestamp:4 LE][text:UTF-8]
   */
  private parseDirectMsgV3(payload: Uint8Array): void {
    if (payload.length < 15) {
      console.warn('[BleGateway] RESP_DIRECT_MSG_V3 trop court:', payload.length);
      return;
    }
    const snrByte = payload[0];
    // payload[1..2] = reserved
    const prefixBytes = payload.slice(3, 9);
    const senderPubkeyPrefix = Array.from(prefixBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pathLen = payload[9];
    // payload[10] = txt_type
    const view = new DataView(payload.buffer, payload.byteOffset);
    const timestamp = view.getUint32(11, true);
    const text = new TextDecoder().decode(payload.slice(15)).replace(/\0/g, '');
    const snr = snrByte / 4.0;

    console.log(`[BleGateway] RESP_DIRECT_MSG_V3 SNR:${snr}dB hops:${pathLen} from=${senderPubkeyPrefix}`);

    if (this.incomingMessageCallback) {
      this.incomingMessageCallback({
        type: 'direct',
        senderPubkeyPrefix,
        pathLen,
        timestamp,
        text,
        snr,
      });
    }
  }

  /**
   * RESP_CHANNEL_MSG_V3 (0x11) layout :
   *   [snr:1][reserved:2][channelIdx:1][path_len:1][txt_type:1][timestamp:4 LE][text:UTF-8]
   */
  private parseChannelMsgV3(payload: Uint8Array): void {
    if (payload.length < 10) {
      console.warn('[BleGateway] RESP_CHANNEL_MSG_V3 trop court:', payload.length);
      return;
    }
    const snrByte = payload[0];
    // payload[1..2] = reserved
    const channelIdx = payload[3];
    const pathLen = payload[4];
    // payload[5] = txt_type
    const view = new DataView(payload.buffer, payload.byteOffset);
    const timestamp = view.getUint32(6, true);
    const text = new TextDecoder().decode(payload.slice(10)).replace(/\0/g, '');
    const snr = snrByte / 4.0;

    console.log(`[BleGateway] RESP_CHANNEL_MSG_V3 ch${channelIdx} SNR:${snr}dB hops:${pathLen}`);

    if (this.incomingMessageCallback) {
      this.incomingMessageCallback({
        type: 'channel',
        channelIdx,
        senderPubkeyPrefix: '',
        pathLen,
        timestamp,
        text,
        snr,
      });
    }
  }

  /**
   * PUSH_ADVERT (0x80) layout : [pubkey:32]
   */
  private parsePushAdvert(payload: Uint8Array): void {
    if (payload.length < 32) {
      console.warn('[BleGateway] PUSH_ADVERT trop court:', payload.length);
      return;
    }
    const pubkeyBytes = payload.slice(0, 32);
    const pubkeyHex = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pubkeyPrefix = pubkeyHex.slice(0, 12);

    console.log(`[BleGateway] PUSH_ADVERT nœud découvert: ${pubkeyPrefix}...`);

    const contact: MeshCoreContact = {
      publicKey: pubkeyBytes,
      pubkeyHex,
      pubkeyPrefix,
      name: `Node-${pubkeyPrefix.slice(0, 6).toUpperCase()}`,
      lastSeen: Math.floor(Date.now() / 1000),
    };
    if (this.contactDiscoveredCallback) this.contactDiscoveredCallback(contact);
  }

  /**
   * PUSH_SEND_CONFIRMED (0x82) layout : [ackCode:4 LE][roundTripMs:4 LE]
   */
  private parseSendConfirmed(payload: Uint8Array): void {
    if (payload.length < 8) return;
    const view = new DataView(payload.buffer, payload.byteOffset);
    const ackCode = view.getUint32(0, true);
    const roundTripMs = view.getUint32(4, true);
    console.log(`[BleGateway] PUSH_SEND_CONFIRMED ACK:${ackCode} RTT:${roundTripMs}ms`);
    if (this.sendConfirmedCallback) this.sendConfirmedCallback(ackCode, roundTripMs);
  }

  /**
   * RESP_CONTACT (0x03) layout (148 bytes) :
   *   [pubkey:32][type:1][flags:1][path_len:1][path:64][name:32][last_advert:4 LE]
   *   [lat:4 LE][lon:4 LE][lastmod:4 LE]
   */
  private parseContact(payload: Uint8Array): void {
    if (payload.length < 147) {
      console.warn('[BleGateway] RESP_CONTACT trop court:', payload.length);
      return;
    }
    const pubkeyBytes = payload.slice(0, 32);
    const pubkeyHex = Array.from(pubkeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const pubkeyPrefix = pubkeyHex.slice(0, 12);

    // Offset 32: type(1)+flags(1)+path_len(1)+path(64) = 67 bytes → offset 99 pour name
    const nameBytes = payload.slice(99, 131); // 32 bytes
    const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim()
      || `Node-${pubkeyPrefix.slice(0, 6).toUpperCase()}`;

    const view = new DataView(payload.buffer, payload.byteOffset);
    const lastAdvert = view.getUint32(131, true);
    const latRaw     = view.getInt32(135, true);
    const lonRaw     = view.getInt32(139, true);

    const contact: MeshCoreContact = {
      publicKey: pubkeyBytes,
      pubkeyHex,
      pubkeyPrefix,
      name,
      lastSeen: lastAdvert,
      lat: latRaw !== 0 ? latRaw / 1e7 : undefined,
      lng: lonRaw !== 0 ? lonRaw / 1e7 : undefined,
    };

    this.pendingContacts.push(contact);
    if (this.contactDiscoveredCallback) this.contactDiscoveredCallback(contact);
  }

  // ── Privé : gateway relay mode ──────────────────────────────────

  private deliverRawPacket(rawBytes: Uint8Array): void {
    if (!this.messageHandler) return;
    try {
      const packet = decodeMeshCorePacket(rawBytes);
      if (packet) this.messageHandler(packet);
    } catch (err) {
      console.error('[BleGateway] Échec décodage paquet LoRa:', err);
    }
  }

  // ── Privé : BLE write ───────────────────────────────────────────

  /**
   * Write WITH response sur 6e400002 (device RX char, PROPERTY_WRITE).
   */
  private async sendFrame(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.connectedId) throw new Error('Non connecté');

    const frame = new Uint8Array(1 + payload.length);
    frame[0] = cmd;
    frame.set(payload, 1);

    for (let offset = 0; offset < frame.length; offset += BLE_MAX_WRITE) {
      const chunk = Array.from(frame.slice(offset, offset + BLE_MAX_WRITE));
      await BleManager.write(
        this.connectedId,
        SERVICE_UUID,
        TX_UUID,    // 6e400002 = App → Device
        chunk,
        BLE_MAX_WRITE
      );
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _instance: BleGatewayClient | null = null;

export function getBleGatewayClient(): BleGatewayClient {
  if (!_instance) _instance = new BleGatewayClient();
  return _instance;
}
