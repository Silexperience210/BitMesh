/**
 * BLE Gateway Client — MeshCore Companion Protocol
 *
 * Connexion au firmware MeshCore ESP32 via BLE (Nordic UART Service).
 * Utilise le protocole officiel MeshCore Companion :
 *   Outgoing : [0x3c][ len_lo ][ len_hi ][ cmd ][ payload... ]
 *   Incoming : [0x3e][ len_lo ][ len_hi ][ code ][ data... ]
 *
 * Les paquets BitMesh (MeshCorePacket) sont tunnelés via la commande
 * SendRawData (cmd=25) → l'ESP32 les broadcast sur LoRa.
 * La réception se fait via le push RawData (code=0x84).
 */

import { BleManager, Device, State } from 'react-native-ble-plx';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';

// Nordic UART Service UUIDs (identiques dans meshcore.js et BitMesh)
const SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID; // 6e400001-...
const TX_UUID     = MESHCORE_BLE.TX_CHAR_UUID;  // 6e400002-... app → device (write)
const RX_UUID     = MESHCORE_BLE.RX_CHAR_UUID;  // 6e400003-... device → app (notify)

// ─────────────────────────────────────────────────────────
// MeshCore Companion Protocol constants
// ─────────────────────────────────────────────────────────
const FRAME_OUTGOING = 0x3c; // ASCII '<'  app → device
const FRAME_INCOMING = 0x3e; // ASCII '>'  device → app

// Command codes (from meshcore.js Constants.CommandCodes)
const CMD_APP_START    = 1;  // Handshake — must be first command after connect
const CMD_SEND_RAW     = 25; // SendRawData — broadcast raw bytes over LoRa

// Response / push codes (from meshcore.js Constants.ResponseCodes / PushCodes)
const RESP_OK          = 0;
const RESP_SELF_INFO   = 5;  // Response to AppStart (device info)
const PUSH_RAW_DATA    = 0x84; // Unsolicited raw LoRa bytes received by device

// Overhead in the RawData push payload before actual data bytes
const RAW_PUSH_HEADER_SIZE = 3; // [snr:int8][rssi:int8][reserved:uint8]

// BLE write chunk size (safe within 512 MTU, accounting for ATT overhead)
const BLE_CHUNK_SIZE = 244;

// ─────────────────────────────────────────────────────────
// Public interfaces (unchanged — BleProvider keeps same API)
// ─────────────────────────────────────────────────────────

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
  publicKey: string;   // hex string (64 chars)
  txPower: number;     // dBm (uint8)
  radioFreqHz: number; // Hz, e.g. 868000000
  radioBwHz: number;   // Hz, e.g. 125000
  radioSf: number;     // e.g. 12
  radioCr: number;     // e.g. 5
  advLat: number;      // degrees (raw / 1e7)
  advLon: number;      // degrees (raw / 1e7)
}

type MessageHandler = (packet: MeshCorePacket) => void;

// ─────────────────────────────────────────────────────────
// Frame parser state machine
// ─────────────────────────────────────────────────────────
type ParseState = 'IDLE' | 'LEN1' | 'LEN2' | 'DATA';

// ─────────────────────────────────────────────────────────
// BleGatewayClient
// ─────────────────────────────────────────────────────────

export class BleGatewayClient {
  private manager: BleManager;
  private device: Device | null = null;
  private messageHandler: MessageHandler | null = null;
  private deviceInfo: BleDeviceInfo | null = null;
  private deviceInfoCallback: ((info: BleDeviceInfo) => void) | null = null;

  // Frame parser state
  private parseState: ParseState = 'IDLE';
  private frameLen: number = 0;
  private frameBuf: number[] = [];

  constructor() {
    this.manager = new BleManager();
  }

  // ── Initialization ───────────────────────────────────────

  async initialize(): Promise<void> {
    const state = await this.manager.state();
    console.log('[BleGateway] BLE state:', state);
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not enabled');
    }
  }

  // ── Scan ─────────────────────────────────────────────────

  /**
   * Scan all named BLE devices (no UUID/name filter — Android often doesn't
   * advertise services in the advertising packet, and users may have set a
   * custom name on their MeshCore device).
   *
   * The list is shown to the user who picks the correct device manually.
   * After connect() we verify Nordic UART service presence.
   */
  async scanForGateways(
    onDeviceFound: (device: BleGatewayDevice) => void,
    timeoutMs: number = 10000
  ): Promise<void> {
    console.log('[BleGateway] Starting BLE scan (no name filter)...');
    const seen = new Set<string>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        console.log(`[BleGateway] Scan finished — ${seen.size} device(s) found`);
        resolve();
      }, timeoutMs);

      this.manager.startDeviceScan(
        null,                          // no service UUID filter (unreliable on Android)
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.manager.stopDeviceScan();
            reject(error);
            return;
          }

          // Skip unnamed / already seen devices
          if (!device || !device.name || seen.has(device.id)) return;

          seen.add(device.id);
          const lname = device.name.toLowerCase();
          console.log(`[BleGateway] Found: "${device.name}" (${device.id}), RSSI ${device.rssi}`);

          const type: 'gateway' | 'companion' =
            lname.includes('gateway') || lname.includes('gw') || lname.includes('relay')
              ? 'gateway'
              : 'companion';

          onDeviceFound({
            id: device.id,
            name: device.name,
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

  // ── Connect ───────────────────────────────────────────────

  async connect(deviceId: string, timeoutMs = 10000): Promise<void> {
    console.log(`[BleGateway] Connecting to ${deviceId}...`);

    // autoConnect:false = connexion directe avec timeout (autoConnect:true peut bloquer indéfiniment)
    this.device = await Promise.race([
      this.manager.connectToDevice(deviceId, { autoConnect: false, requestMTU: 512 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout — device not reachable')), timeoutMs)
      ),
    ]);
    console.log(`[BleGateway] Connected to "${this.device.name}"`);

    await this.device.discoverAllServicesAndCharacteristics();
    console.log('[BleGateway] Services discovered');

    // Verify this device has the Nordic UART service
    const services = await this.device.services();
    const hasUart = services.some(
      (s) => s.uuid.toLowerCase() === SERVICE_UUID.toLowerCase()
    );
    if (!hasUart) {
      const name = this.device.name ?? deviceId;
      await this.device.cancelConnection();
      this.device = null;
      throw new Error(
        `Device "${name}" does not expose Nordic UART service. ` +
        'Make sure it runs MeshCore Companion firmware.'
      );
    }

    // Subscribe to incoming notifications before sending anything
    this.resetParser();
    this.subscribeToRx();

    // MeshCore handshake: AppStart must be the first command
    // Payload: [version=1][reserved:6=0x00]["test" as UTF-8]
    const appStartPayload = new Uint8Array([
      0x01,                          // version
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved (6 bytes)
      0x74, 0x65, 0x73, 0x74,        // "test"
    ]);
    await this.sendFrame(CMD_APP_START, appStartPayload);
    console.log('[BleGateway] AppStart sent — waiting for device...');

    // Brief delay for the device to process AppStart and send SelfInfo
    await new Promise((res) => setTimeout(res, 600));
    console.log('[BleGateway] Ready');
  }

  // ── Disconnect ────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this.device) {
      console.log('[BleGateway] Disconnecting...');
      await this.device.cancelConnection().catch(() => {});
      this.device = null;
      console.log('[BleGateway] Disconnected');
    }
  }

  // ── Send packet ───────────────────────────────────────────

  /**
   * Send a BitMesh MeshCorePacket over LoRa via the MeshCore firmware.
   *
   * The packet is encoded to binary then wrapped in a SendRawData frame
   * (cmd=25, path_length=0 → flood/broadcast).
   *
   * Frame sent: [0x3c][len_lo][len_hi][0x19][0x00][packet_bytes...]
   *   0x19 = CMD_SEND_RAW (25)
   *   0x00 = path_length (0 = broadcast / no specific route)
   */
  async sendPacket(packet: MeshCorePacket): Promise<void> {
    if (!this.device) throw new Error('Not connected to a MeshCore device');

    const encoded = encodeMeshCorePacket(packet);

    // Payload = [path_length=0][raw_bytes...]
    const payload = new Uint8Array(1 + encoded.length);
    payload[0] = 0x00; // path_length = 0 (broadcast)
    payload.set(encoded, 1);

    console.log(
      `[BleGateway] sendPacket type=${packet.type} → SendRawData (${encoded.length} bytes)`
    );
    await this.sendFrame(CMD_SEND_RAW, payload);
  }

  // ── Message handler ───────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // ── Device info callback ───────────────────────────────────

  onDeviceInfo(cb: (info: BleDeviceInfo) => void): void {
    this.deviceInfoCallback = cb;
  }

  getDeviceInfo(): BleDeviceInfo | null {
    return this.deviceInfo;
  }

  // ── Accessors ─────────────────────────────────────────────

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

  // ── Private: BLE RX subscription ─────────────────────────

  private subscribeToRx(): void {
    if (!this.device) return;

    this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      RX_UUID,
      (error, characteristic) => {
        if (error) {
          console.error('[BleGateway] RX error:', error);
          return;
        }
        if (!characteristic?.value) return;

        const bytes = this.b64ToBytes(characteristic.value);
        this.feedParser(bytes);
      }
    );
    console.log('[BleGateway] Subscribed to RX notifications');
  }

  // ── Private: Frame parser ─────────────────────────────────

  private resetParser(): void {
    this.parseState = 'IDLE';
    this.frameLen = 0;
    this.frameBuf = [];
  }

  /**
   * Feed incoming BLE bytes through the frame state machine.
   * Frames can arrive split across multiple BLE notifications.
   */
  private feedParser(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];

      switch (this.parseState) {
        case 'IDLE':
          if (b === FRAME_INCOMING) {
            this.frameLen = 0;
            this.frameBuf = [];
            this.parseState = 'LEN1';
          }
          // Silently discard non-frame bytes while idle
          break;

        case 'LEN1':
          this.frameLen = b;          // low byte
          this.parseState = 'LEN2';
          break;

        case 'LEN2':
          this.frameLen |= (b << 8); // high byte
          if (this.frameLen === 0) {
            // Empty frame — ignore
            this.parseState = 'IDLE';
          } else {
            this.parseState = 'DATA';
          }
          break;

        case 'DATA':
          this.frameBuf.push(b);
          if (this.frameBuf.length >= this.frameLen) {
            this.handleFrame(new Uint8Array(this.frameBuf));
            this.parseState = 'IDLE';
          }
          break;
      }
    }
  }

  /**
   * Handle a complete incoming frame.
   * data[0] = response/push code
   * data[1..] = payload
   */
  private handleFrame(data: Uint8Array): void {
    if (data.length === 0) return;

    const code = data[0];
    const payload = data.slice(1);

    console.log(
      `[BleGateway] Frame code=0x${code.toString(16)} (${payload.length} payload bytes)`
    );

    switch (code) {
      case RESP_SELF_INFO:
        // AppStart response — parse device info
        this.parseSelfInfo(payload);
        break;

      case RESP_OK:
        // Generic OK — e.g. after SendRawData
        break;

      case PUSH_RAW_DATA:
        // Incoming raw LoRa data: [snr][rssi][reserved][bitMeshPacket...]
        if (payload.length > RAW_PUSH_HEADER_SIZE) {
          const snr    = (payload[0] << 24 >> 24) / 4; // int8 sign-extend
          const rssi   = payload[1] << 24 >> 24;       // int8 sign-extend
          const rawPkt = payload.slice(RAW_PUSH_HEADER_SIZE);

          console.log(
            `[BleGateway] RawData push — SNR:${snr} RSSI:${rssi} bytes:${rawPkt.length}`
          );
          this.deliverRawPacket(rawPkt);
        }
        break;

      default:
        console.log(`[BleGateway] Unhandled response code 0x${code.toString(16)}`);
        break;
    }
  }

  /**
   * Parse SelfInfo binary payload (response code 5).
   * Layout (little-endian):
   *   [type:1][txPower:1][maxTxPower:1][publicKey:32]
   *   [advLat:4][advLon:4][reserved:3][manualAddContacts:1]
   *   [radioFreq:4][radioBw:4][radioSf:1][radioCr:1]
   *   [name: remaining UTF-8 bytes]
   * Total header = 57 bytes before name.
   */
  private parseSelfInfo(payload: Uint8Array): void {
    if (payload.length < 57) {
      console.warn('[BleGateway] SelfInfo payload too short:', payload.length);
      return;
    }

    const view = new DataView(payload.buffer, payload.byteOffset);
    let offset = 0;

    /* type */         offset += 1;
    const txPower =    payload[offset++];
    /* maxTxPower */   offset += 1;

    const pubkeyBytes = payload.slice(offset, offset + 32);
    const publicKey = Array.from(pubkeyBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    offset += 32;

    const advLatRaw = view.getInt32(offset, true);  offset += 4;
    const advLonRaw = view.getInt32(offset, true);  offset += 4;

    /* reserved (3) + manualAddContacts (1) */
    offset += 4;

    const radioFreqHz = view.getUint32(offset, true); offset += 4;
    const radioBwHz   = view.getUint32(offset, true); offset += 4;
    const radioSf     = payload[offset++];
    const radioCr     = payload[offset++];

    const nameRaw = payload.slice(offset);
    const name = new TextDecoder()
      .decode(nameRaw)
      .replace(/\0/g, '')
      .trim() || this.device?.name || 'Unknown';

    const info: BleDeviceInfo = {
      name,
      publicKey,
      txPower,
      radioFreqHz,
      radioBwHz,
      radioSf,
      radioCr,
      advLat: advLatRaw / 1e7,
      advLon: advLonRaw / 1e7,
    };

    this.deviceInfo = info;
    console.log('[BleGateway] SelfInfo received:', {
      name: info.name,
      radioFreq: info.radioFreqHz,
      radioBw: info.radioBwHz,
      radioSf: info.radioSf,
      txPower: info.txPower,
    });

    if (this.deviceInfoCallback) {
      this.deviceInfoCallback(info);
    }
  }

  private deliverRawPacket(rawBytes: Uint8Array): void {
    if (!this.messageHandler) return;
    try {
      const packet = decodeMeshCorePacket(rawBytes);
      if (packet) {
        this.messageHandler(packet);
      }
    } catch (err) {
      console.error('[BleGateway] Failed to decode incoming LoRa packet:', err);
    }
  }

  // ── Private: Frame builder ────────────────────────────────

  /**
   * Build and send a MeshCore Companion Protocol frame.
   * Frame: [FRAME_OUTGOING][len_lo][len_hi][cmd][...payload]
   */
  private async sendFrame(cmd: number, payload: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Not connected');

    const frameData = new Uint8Array(1 + payload.length);
    frameData[0] = cmd;
    frameData.set(payload, 1);

    const frame = new Uint8Array(3 + frameData.length);
    frame[0] = FRAME_OUTGOING;
    frame[1] = frameData.length & 0xff;
    frame[2] = (frameData.length >> 8) & 0xff;
    frame.set(frameData, 3);

    await this.writeBle(frame);
  }

  /**
   * Write bytes to the BLE TX characteristic, chunked to fit MTU.
   */
  private async writeBle(data: Uint8Array): Promise<void> {
    if (!this.device) throw new Error('Not connected');

    for (let offset = 0; offset < data.length; offset += BLE_CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + BLE_CHUNK_SIZE);
      const b64   = this.bytesToB64(chunk);
      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        TX_UUID,
        b64
      );
    }
  }

  // ── Private: Base64 helpers ───────────────────────────────

  private bytesToB64(data: Uint8Array): string {
    return btoa(
      Array.from(data)
        .map((b) => String.fromCharCode(b))
        .join('')
    );
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────
// Singleton accessor
// ─────────────────────────────────────────────────────────

let _instance: BleGatewayClient | null = null;

export function getBleGatewayClient(): BleGatewayClient {
  if (!_instance) {
    _instance = new BleGatewayClient();
  }
  return _instance;
}
