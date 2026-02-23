/**
 * BLE Gateway Client — MeshCore Companion Protocol (corrected)
 *
 * Source de vérité : meshcore-open (Flutter officiel) + meshcore-cli (Python)
 * https://github.com/zjs81/meshcore-open
 * https://github.com/meshcore-dev/meshcore-cli
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PROTOCOLE BLE — IMPORTANT                                          ║
 * ║  Pour BLE, chaque write/notification est UN frame complet.          ║
 * ║  PAS de framing bytes [0x3c/0x3e][len] comme en USB/Serial.         ║
 * ║  Write  → device : [cmd][payload...]                                 ║
 * ║  Notify ← device : [code][data...]                                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Séquence après connexion (cf. meshcore_connector.dart) :
 *   1. DeviceQuery  (cmd=22)  → respDeviceInfo (13)
 *   2. AppStart     (cmd=1)   → respSelfInfo   (5)   [public key, radio params]
 *   3. SetTime      (cmd=6)   (envoyé juste après réception SelfInfo)
 *   4. SendRawData  (cmd=25)  pour relayer les paquets BitMesh sur LoRa
 *
 * Les devices MeshCore Companion s'annoncent sous "MeshCore-XXXXXXXX"
 * (préfixe "MeshCore-" + nom du nœud ou adresse MAC).
 */

import { BleManager, Device, State } from 'react-native-ble-plx';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';

// ── Nordic UART Service UUIDs ──────────────────────────────
// Source : meshcore-open meshcore_connector.dart (confirmé)
const SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID; // 6e400001-b5a3-f393-e0a9-e50e24dcca9e
const TX_UUID      = MESHCORE_BLE.TX_CHAR_UUID; // 6e400002-... write (app → device)
const RX_UUID      = MESHCORE_BLE.RX_CHAR_UUID; // 6e400003-... notify (device → app)

// ── Command codes (app → device) ──────────────────────────
const CMD_APP_START    = 1;   // Handshake principal
const CMD_SET_TIME     = 6;   // Sync horloge après SelfInfo
const CMD_DEVICE_QUERY = 22;  // Premier message (version protocole)
const CMD_SEND_RAW     = 25;  // Broadcast raw bytes sur LoRa

// ── Response / push codes (device → app) ──────────────────
const RESP_OK          = 0;
const RESP_SELF_INFO   = 5;   // Réponse à AppStart : public key, radio params, nom
const RESP_DEVICE_INFO = 13;  // Réponse à DeviceQuery : firmware, model
const PUSH_RAW_DATA    = 0x84; // Push non-sollicité : données LoRa reçues

// Protocole BLE version (envoyé dans DeviceQuery)
const APP_PROTOCOL_VERSION = 3;

// Taille de l'en-tête RawData push : [snr:int8][rssi:int8][reserved:uint8]
const RAW_PUSH_HEADER_SIZE = 3;

// Device MAX_FRAME_SIZE = 172. MTU négocié = min(requestMTU, 172).
// Max ATT data = MTU - 3 overhead = 172 - 3 = 169 bytes.
const BLE_CHUNK_SIZE = 169;

// ── Interfaces publiques ───────────────────────────────────

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
  publicKey: string;   // hex string 64 chars (32 bytes)
  txPower: number;     // dBm
  radioFreqHz: number; // Hz, ex: 868000000
  radioBwHz: number;   // Hz, ex: 125000
  radioSf: number;     // ex: 12
  radioCr: number;     // ex: 5
  advLat: number;      // degrés
  advLon: number;      // degrés
}

type MessageHandler = (packet: MeshCorePacket) => void;

// ── BleGatewayClient ──────────────────────────────────────

export class BleGatewayClient {
  private manager: BleManager;
  private device: Device | null = null;
  private messageHandler: MessageHandler | null = null;
  private deviceInfo: BleDeviceInfo | null = null;
  private deviceInfoCallback: ((info: BleDeviceInfo) => void) | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  // ── Initialization ──────────────────────────────────────

  async initialize(): Promise<void> {
    const state = await this.manager.state();
    console.log('[BleGateway] BLE state:', state);
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not enabled');
    }
  }

  // ── Scan ────────────────────────────────────────────────

  /**
   * Scan BLE actif (scanMode=LowLatency) — montre TOUS les devices.
   *
   * Les devices MeshCore Companion s'annoncent sous "MeshCore-XXXXXXXX".
   * Le nom est dans le scan response packet → nécessite active scan.
   * On montre aussi les devices sans nom (null) pour ne rien manquer.
   */
  async scanForGateways(
    onDeviceFound: (device: BleGatewayDevice) => void,
    timeoutMs: number = 10000
  ): Promise<void> {
    console.log('[BleGateway] Scan actif (LowLatency, tous devices)...');
    const seen = new Set<string>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        console.log(`[BleGateway] Scan terminé — ${seen.size} device(s)`);
        resolve();
      }, timeoutMs);

      this.manager.startDeviceScan(
        null,                                    // pas de filtre UUID (Android peu fiable)
        { allowDuplicates: false, scanMode: 2 }, // scanMode 2 = LowLatency = active scan
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.manager.stopDeviceScan();
            reject(error);
            return;
          }

          if (!device) return;
          // Mise à jour si on reçoit le nom pour un device déjà vu (scan response tardif)
          if (seen.has(device.id) && !device.name) return;

          seen.add(device.id);
          const displayName = device.name || `BLE Device (${device.id.slice(0, 8)})`;
          console.log(`[BleGateway] Trouvé: "${displayName}" (${device.id}) RSSI ${device.rssi}`);

          // Identifier les Companion MeshCore par préfixe (source: meshcore-open)
          const isMeshCore =
            displayName.startsWith('MeshCore-') || displayName.startsWith('Whisper-');
          const lname = displayName.toLowerCase();
          const type: 'gateway' | 'companion' = isMeshCore
            ? 'companion'
            : lname.includes('gateway') || lname.includes('relay') || lname.includes('gw')
              ? 'gateway'
              : 'companion';

          onDeviceFound({
            id: device.id,
            name: displayName,
            rssi: device.rssi || -100,
            type,
          });
        }
      );
    });
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
  }

  // ── Connect ─────────────────────────────────────────────

  /**
   * Connexion + handshake MeshCore Companion.
   *
   * Source de vérité : meshcore_connector.dart (meshcore-open Flutter officiel)
   * https://github.com/zjs81/meshcore-open
   *
   * ⚠️  BONDING MITM :
   *   Les deux caractéristiques ont PERM_*_ENC_MITM.
   *   deviceConnected = true dans le firmware SEULEMENT après onAuthenticationComplete().
   *
   * ⚠️  PIÈGE CRITIQUE — monitorCharacteristicForService :
   *   Si la souscription échoue (auth error), react-native-ble-plx ne re-tente pas.
   *   → Après bonding, les notifications sont silencieuses (device répond mais on n'écoute plus).
   *   → Fix : auto-retry de subscribeToRx() sur erreur auth (comme Flutter setNotifyValue x3).
   *
   * Séquence (identique à meshcore_connector.dart) :
   *   1. connect(mtu=null) + requestMtu(185) séparé
   *   2. discoverServices → trouver UART service + characteristics
   *   3. setNotifyValue(true) sur TX char (6e400003) — avec retry auto
   *   4. DeviceQuery (cmd=22) + AppStart (cmd=1) — avec retry bonding
   *   5. Attendre SelfInfo (code=5) → SetTime auto dans parseSelfInfo
   */
  async connect(deviceId: string, timeoutMs = 60000): Promise<void> {
    console.log(`[BleGateway] Connexion à ${deviceId}...`);

    // ── Étape 1 : connexion BLE link layer (timeout 15s, pas de MTU ici) ──
    // Flutter : device.connect(timeout: 15s, mtu: null)
    this.device = await Promise.race([
      this.manager.connectToDevice(deviceId, { autoConnect: false }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout connexion — device hors portée')), 15000)
      ),
    ]);
    console.log(`[BleGateway] Connecté à "${this.device.name}"`);

    // ── Étape 2 : MTU séparé (Flutter : requestMtu(185), ignorer erreur) ──
    try {
      await this.device.requestMTU(185);
      console.log('[BleGateway] MTU 185 négocié');
    } catch {
      console.log('[BleGateway] MTU request ignoré (device max 172)');
    }

    // ── Étape 3 : découverte des services ──
    await this.device.discoverAllServicesAndCharacteristics();
    console.log('[BleGateway] Services découverts');

    // Vérifier la présence du Nordic UART Service (NUS)
    const services = await this.device.services();
    const hasUart = services.some(
      (s) => s.uuid.toLowerCase() === SERVICE_UUID.toLowerCase()
    );
    if (!hasUart) {
      const name = this.device.name ?? deviceId;
      await this.device.cancelConnection();
      this.device = null;
      throw new Error(
        `"${name}" n'a pas le service Nordic UART (NUS). ` +
        'Vérifiez que ce device tourne le firmware MeshCore Companion (variante BLE).'
      );
    }

    // ── Étape 4 : activer les notifications TX (6e400003) ──
    // Flutter : setNotifyValue(true) avec 3 tentatives × 500ms
    // CRITIQUE : si auth error → on re-tente automatiquement dans subscribeToRx().
    // Après bonding, la souscription est réétablie automatiquement.
    this.subscribeToRx();

    // ── Étape 5 : DeviceQuery (cmd=22) ──
    // Premier write → déclenche GATT_INSUFFICIENT_AUTH (133)
    // → Android ouvre le dialogue PIN → utilisateur entre 123456
    // → sendWithBondingRetry patiente et retente jusqu'à bonding terminé
    await this.sendWithBondingRetry(CMD_DEVICE_QUERY, new Uint8Array([APP_PROTOCOL_VERSION]));
    console.log('[BleGateway] DeviceQuery envoyé');
    await new Promise((res) => setTimeout(res, 400));

    // ── Étape 6 : AppStart (cmd=1) ──
    // Flutter : [1][appVer=1][reserved×6]["MeshCoreOpen\0"]
    const appName = 'BitMesh\0';
    const appNameBytes = new TextEncoder().encode(appName);
    const appStartPayload = new Uint8Array(1 + 6 + appNameBytes.length);
    appStartPayload[0] = 0x01; // app version
    // bytes 1-6 : reserved (0x00)
    appStartPayload.set(appNameBytes, 7);
    await this.sendWithBondingRetry(CMD_APP_START, appStartPayload);
    console.log('[BleGateway] AppStart envoyé — en attente SelfInfo (code=5)...');

    // SelfInfo → SetTime envoyé automatiquement dans parseSelfInfo
    // Attendre jusqu'à 5s (Flutter _waitForSelfInfo timeout = 3s × 2 essais)
    await new Promise((res) => setTimeout(res, 5000));
    console.log('[BleGateway] Handshake terminé');
  }

  // ── Disconnect ───────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.device) {
      console.log('[BleGateway] Déconnexion...');
      await this.device.cancelConnection().catch(() => {});
      this.device = null;
      console.log('[BleGateway] Déconnecté');
    }
  }

  // ── Send BitMesh packet ──────────────────────────────────

  /**
   * Envoie un paquet BitMesh via LoRa (broadcast).
   * BLE frame : [cmd=25][path_len=0][packet_bytes...]
   */
  async sendPacket(packet: MeshCorePacket): Promise<void> {
    if (!this.device) throw new Error('Non connecté à un device MeshCore');

    const encoded = encodeMeshCorePacket(packet);
    const payload = new Uint8Array(1 + encoded.length);
    payload[0] = 0x00; // path_length = 0 (broadcast)
    payload.set(encoded, 1);

    console.log(`[BleGateway] sendPacket type=${packet.type} → SendRaw (${encoded.length}B)`);
    await this.sendFrame(CMD_SEND_RAW, payload);
  }

  // ── Handlers publics ─────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onDeviceInfo(cb: (info: BleDeviceInfo) => void): void {
    this.deviceInfoCallback = cb;
  }

  getDeviceInfo(): BleDeviceInfo | null {
    return this.deviceInfo;
  }

  isConnected(): boolean {
    return this.device !== null;
  }

  getConnectedDevice(): BleGatewayDevice | null {
    if (!this.device) return null;
    return {
      id: this.device.id,
      name: this.device.name || 'Unknown',
      rssi: this.device.rssi || -100,
    };
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.manager.destroy();
  }

  // ── Privé : RX subscription ──────────────────────────────

  /**
   * S'abonne aux notifications BLE (TX characteristic, 6e400003).
   *
   * PROTOCOLE BLE : chaque notification = frame complet [code][data...]
   * Source : meshcore_connector.dart — setNotifyValue(true) + onValueReceived.listen()
   *
   * ⚠️  AUTO-RETRY CRITIQUE :
   *   Si monitorCharacteristicForService échoue avec GATT_INSUFFICIENT_AUTH (133),
   *   c'est parce que le bonding n'est pas encore terminé.
   *   Flutter fait 3 tentatives avec délais progressifs (500ms, 1000ms, 1500ms).
   *   On fait pareil : on se re-souscrit automatiquement après un délai.
   *   Sans ça, après bonding réussi, le device répond mais on n'écoute plus rien.
   */
  private subscribeToRx(attempt = 0): void {
    if (!this.device) return;
    const MAX_ATTEMPTS = 5;

    this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      RX_UUID,
      (error, characteristic) => {
        if (error) {
          const msg = String(error?.reason ?? error?.message ?? error ?? '').toLowerCase();
          const isAuthErr =
            msg.includes('133') ||
            msg.includes('insufficient') ||
            msg.includes('authentication') ||
            msg.includes('bonding') ||
            msg.includes('encrypt') ||
            msg.includes('15');

          if (isAuthErr && attempt < MAX_ATTEMPTS) {
            const delay = 500 + attempt * 500; // 500ms, 1s, 1.5s, 2s, 2.5s
            console.log(
              `[BleGateway] Auth requis pour notifications (tentative ${attempt + 1}/${MAX_ATTEMPTS}), ` +
              `réessai dans ${delay}ms...`
            );
            setTimeout(() => this.subscribeToRx(attempt + 1), delay);
          } else if (!msg.includes('cancelled') && !msg.includes('disconnected')) {
            console.error(`[BleGateway] Erreur RX (tentative ${attempt + 1}):`, msg);
          }
          return;
        }

        if (!characteristic?.value) return;
        const bytes = this.b64ToBytes(characteristic.value);
        this.handleFrame(bytes);
      }
    );

    if (attempt === 0) {
      console.log('[BleGateway] Souscription notifications TX (6e400003)...');
    }
  }

  // ── Privé : Frame handler ────────────────────────────────

  private handleFrame(data: Uint8Array): void {
    if (data.length === 0) return;

    const code = data[0];
    const payload = data.slice(1);

    console.log(`[BleGateway] Frame reçu code=0x${code.toString(16)} (${payload.length}B)`);

    switch (code) {
      case RESP_SELF_INFO:
        this.parseSelfInfo(payload);
        break;

      case RESP_DEVICE_INFO:
        console.log('[BleGateway] DeviceInfo reçu (firmware/model)');
        break;

      case RESP_OK:
        // ACK générique (ex: après SendRawData)
        break;

      case PUSH_RAW_DATA:
        // Push LoRa : [snr:int8][rssi:int8][reserved:uint8][bitMeshPacket...]
        if (payload.length > RAW_PUSH_HEADER_SIZE) {
          const snr  = (payload[0] << 24 >> 24) / 4;
          const rssi = payload[1] << 24 >> 24;
          const raw  = payload.slice(RAW_PUSH_HEADER_SIZE);
          console.log(`[BleGateway] RawData push SNR:${snr} RSSI:${rssi} (${raw.length}B)`);
          this.deliverRawPacket(raw);
        }
        break;

      default:
        console.log(`[BleGateway] Code non géré 0x${code.toString(16)}`);
        break;
    }
  }

  // ── Privé : SelfInfo parser ──────────────────────────────

  /**
   * Parse SelfInfo (code=5) — source : meshcore-open parseSelfInfo()
   *
   * Layout (little-endian) :
   *   [0]      type       (1B)
   *   [1]      txPower    (1B)
   *   [2]      maxTxPower (1B)
   *   [3]      flags      (1B)   ← octet manquant dans notre ancienne version !
   *   [4..35]  publicKey  (32B)
   *   [36..39] advLat     (int32 LE)
   *   [40..43] advLon     (int32 LE)
   *   [44..47] reserved(3)+manualAddContacts(1)
   *   [48..51] radioFreq  (uint32 LE, Hz)
   *   [52..55] radioBw    (uint32 LE, Hz)
   *   [56]     radioSf    (uint8)
   *   [57]     radioCr    (uint8)
   *   [58+]    name       (UTF-8 C-string, null-terminated)
   */
  private parseSelfInfo(payload: Uint8Array): void {
    if (payload.length < 58) {
      console.warn('[BleGateway] SelfInfo trop court:', payload.length, 'bytes');
      return;
    }

    const view = new DataView(payload.buffer, payload.byteOffset);
    let offset = 0;

    /* type    */ offset += 1;
    const txPower = payload[offset++];
    /* maxTxPow */ offset += 1;
    /* flags    */ offset += 1; // octet supplémentaire (présent dans meshcore-open)

    const pubkeyBytes = payload.slice(offset, offset + 32);
    const publicKey   = Array.from(pubkeyBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    offset += 32; // → offset 36

    const advLatRaw = view.getInt32(offset, true);  offset += 4; // → 40
    const advLonRaw = view.getInt32(offset, true);  offset += 4; // → 44

    /* reserved(3) + manualAddContacts(1) */ offset += 4; // → 48

    const radioFreqHz = view.getUint32(offset, true); offset += 4; // → 52
    const radioBwHz   = view.getUint32(offset, true); offset += 4; // → 56
    const radioSf     = payload[offset++];                          // → 57
    const radioCr     = payload[offset++];                          // → 58

    // name = C-string UTF-8 à partir de l'offset 58
    const nameRaw = payload.slice(offset);
    const name = new TextDecoder()
      .decode(nameRaw)
      .replace(/\0/g, '')
      .trim() || this.device?.name || 'Unknown';

    const info: BleDeviceInfo = {
      name, publicKey, txPower,
      radioFreqHz, radioBwHz, radioSf, radioCr,
      advLat: advLatRaw / 1e7,
      advLon: advLonRaw / 1e7,
    };

    this.deviceInfo = info;
    console.log('[BleGateway] SelfInfo reçu:', {
      name: info.name,
      pubkey: info.publicKey.slice(0, 16) + '...',
      freq: info.radioFreqHz,
      sf: info.radioSf,
      txPower: info.txPower,
    });

    if (this.deviceInfoCallback) {
      this.deviceInfoCallback(info);
    }

    // ── Étape 3 : SetTime (cmd=6) ──────────────────────────
    // Obligatoire après SelfInfo (cf. meshcore_connector.dart)
    // Format : [timestamp: uint32 LE]
    const ts = Math.floor(Date.now() / 1000);
    const timeBuf = new Uint8Array(4);
    new DataView(timeBuf.buffer).setUint32(0, ts, true);
    this.sendFrame(CMD_SET_TIME, timeBuf)
      .then(() => console.log('[BleGateway] SetTime envoyé:', ts))
      .catch((e) => console.warn('[BleGateway] SetTime échoué:', e));
  }

  private deliverRawPacket(rawBytes: Uint8Array): void {
    if (!this.messageHandler) return;
    try {
      const packet = decodeMeshCorePacket(rawBytes);
      if (packet) this.messageHandler(packet);
    } catch (err) {
      console.error('[BleGateway] Échec décodage paquet LoRa:', err);
    }
  }

  // ── Privé : BLE write ────────────────────────────────────

  /**
   * sendWithBondingRetry — write avec gestion du bonding Android.
   *
   * Le firmware exige ESP_LE_AUTH_REQ_SC_MITM_BOND sur les deux caractéristiques.
   * Quand l'app tente d'écrire sans être bondée :
   *   • L'ESP32 renvoie GATT_INSUFFICIENT_AUTHENTICATION
   *   • Android détecte ce code et ouvre automatiquement le dialogue de couplage
   *   • L'utilisateur entre le PIN (défaut 123456)
   *   • Le bonding se termine en tâche de fond
   *   • On doit RETENTER l'écriture manuellement
   *
   * Intervalles : 4s, 6s, 8s, 10s → jusqu'à ~28s d'attente max.
   */
  private async sendWithBondingRetry(cmd: number, payload: Uint8Array): Promise<void> {
    const RETRY_DELAYS = [4000, 6000, 8000, 10000];
    let lastErr: any;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        await this.sendFrame(cmd, payload);
        if (attempt > 0) {
          console.log(`[BleGateway] cmd=${cmd} OK après ${attempt} tentative(s) de bonding`);
        }
        return;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.reason ?? err?.message ?? err ?? '').toLowerCase();
        const isAuthErr =
          msg.includes('133')           || // Android GATT_ERROR / INSUFFICIENT_AUTH
          msg.includes('15')            || // GATT_AUTH_FAIL
          msg.includes('insufficient')  ||
          msg.includes('authentication') ||
          msg.includes('bonding')       ||
          msg.includes('pairing')       ||
          msg.includes('encrypt');

        if (isAuthErr && attempt < RETRY_DELAYS.length) {
          const wait = RETRY_DELAYS[attempt];
          console.log(
            `[BleGateway] Appairage BLE requis (cmd=${cmd}, tentative ${attempt + 1}/${RETRY_DELAYS.length}). ` +
            `Entrez le PIN dans le dialogue Android. Prochain essai dans ${wait / 1000}s...`
          );
          await new Promise((res) => setTimeout(res, wait));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /**
   * Envoie un frame BLE au device.
   *
   * PROTOCOLE BLE : pas de framing bytes [0x3c][len].
   * On écrit directement [cmd][payload...] dans la caractéristique TX.
   * Source : "For BLE - a frame is simply a single characteristic value."
   */
  private async sendFrame(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Non connecté');

    // BLE frame = [cmd][payload...] — sans entête USB
    const frame = new Uint8Array(1 + payload.length);
    frame[0] = cmd;
    frame.set(payload, 1);

    await this.writeBle(frame);
  }

  private async writeBle(data: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Non connecté');

    for (let offset = 0; offset < data.length; offset += BLE_CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + BLE_CHUNK_SIZE);
      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        TX_UUID,
        this.bytesToB64(chunk)
      );
    }
  }

  // ── Privé : Base64 ───────────────────────────────────────

  private bytesToB64(data: Uint8Array): string {
    return btoa(Array.from(data).map((b) => String.fromCharCode(b)).join(''));
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}

// ── Singleton ─────────────────────────────────────────────

let _instance: BleGatewayClient | null = null;

export function getBleGatewayClient(): BleGatewayClient {
  if (!_instance) _instance = new BleGatewayClient();
  return _instance;
}
