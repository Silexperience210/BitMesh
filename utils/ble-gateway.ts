/**
 * BLE Gateway Client
 *
 * Connexion au gateway ESP32 LoRa via BLE (Nordic UART Service)
 * Conforme à MeshCore Protocol v1.0
 */

import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import {
  MESHCORE_BLE,
  type MeshCorePacket,
  encodeMeshCorePacket,
  decodeMeshCorePacket,
} from './meshcore-protocol';

// Nordic UART Service UUIDs (MeshCore standard)
const UART_SERVICE_UUID = MESHCORE_BLE.SERVICE_UUID;
const UART_TX_CHAR_UUID = MESHCORE_BLE.TX_CHAR_UUID;
const UART_RX_CHAR_UUID = MESHCORE_BLE.RX_CHAR_UUID;

export interface BleGatewayDevice {
  id: string;
  name: string;
  rssi: number;
}

export interface BleGatewayState {
  connected: boolean;
  device: BleGatewayDevice | null;
  scanning: boolean;
  error: string | null;
}

type MessageHandler = (packet: MeshCorePacket) => void;

/**
 * Client BLE pour gateway ESP32 LoRa
 */
export class BleGatewayClient {
  private manager: BleManager;
  private device: Device | null = null;
  private messageHandler: MessageHandler | null = null;
  private rxCharacteristic: Characteristic | null = null;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * Initialise le BLE manager
   */
  async initialize(): Promise<void> {
    const state = await this.manager.state();
    console.log('[BleGateway] BLE state:', state);

    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not enabled');
    }
  }

  /**
   * Scanne les devices BLE avec Nordic UART service
   */
  async scanForGateways(
    onDeviceFound: (device: BleGatewayDevice) => void,
    timeoutMs: number = 10000
  ): Promise<void> {
    console.log('[BleGateway] Starting scan...');

    const foundDevices = new Set<string>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        console.log(`[BleGateway] Scan finished (timeout ${timeoutMs}ms)`);
        resolve();
      }, timeoutMs);

      // ✅ FIX: Scanner TOUS les devices sans filtre UUID
      // Le filtre UUID ne fonctionne pas sur Android si le device n'annonce pas le service dans l'advertising
      this.manager.startDeviceScan(
        null, // ✅ Pas de filtre UUID
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.manager.stopDeviceScan();
            console.error('[BleGateway] Scan error:', error);
            reject(error);
            return;
          }

          if (device && !foundDevices.has(device.id)) {
            // Filtrer par nom pour trouver les gateways MeshCore/ESP32
            const name = device.name || '';
            const isMeshCoreGateway =
              name.toLowerCase().includes('meshcore') ||
              name.toLowerCase().includes('esp32') ||
              name.toLowerCase().includes('mesh') ||
              name.toLowerCase().includes('lora');

            if (isMeshCoreGateway) {
              foundDevices.add(device.id);
              console.log(`[BleGateway] Found device: ${device.name || 'Unknown'} (${device.id}), RSSI: ${device.rssi}`);

              onDeviceFound({
                id: device.id,
                name: device.name || 'MeshCore Gateway',
                rssi: device.rssi || -100,
              });
            }
          }
        }
      );
    });
  }

  /**
   * Arrête le scan
   */
  stopScan() {
    this.manager.stopDeviceScan();
    console.log('[BleGateway] Scan stopped');
  }

  /**
   * Connecte à un gateway
   */
  async connect(deviceId: string): Promise<void> {
    console.log(`[BleGateway] Connecting to ${deviceId}...`);

    try {
      // Connecter au device
      this.device = await this.manager.connectToDevice(deviceId, {
        autoConnect: true,
        requestMTU: 512,
      });

      console.log(`[BleGateway] Connected to ${this.device.name}`);

      // Découvrir les services et characteristics
      await this.device.discoverAllServicesAndCharacteristics();
      console.log('[BleGateway] Services discovered');

      // Vérifier que le service UART existe
      const services = await this.device.services();
      const uartService = services.find((s) => s.uuid === UART_SERVICE_UUID);

      if (!uartService) {
        throw new Error('Nordic UART service not found on device');
      }

      // Vérifier les characteristics
      const characteristics = await uartService.characteristics();
      const rxChar = characteristics.find((c) => c.uuid === UART_RX_CHAR_UUID);

      if (!rxChar) {
        throw new Error('RX characteristic not found');
      }

      this.rxCharacteristic = rxChar;

      // Subscribe aux notifications RX (ESP32 → Mobile)
      await this.subscribeToMessages();

      console.log('[BleGateway] Successfully connected and subscribed');
    } catch (error) {
      console.error('[BleGateway] Connection error:', error);
      this.device = null;
      throw error;
    }
  }

  /**
   * Subscribe aux messages entrants depuis le gateway
   */
  private async subscribeToMessages(): Promise<void> {
    if (!this.device || !this.rxCharacteristic) {
      throw new Error('Device not connected');
    }

    console.log('[BleGateway] Subscribing to RX characteristic...');

    this.device.monitorCharacteristicForService(
      UART_SERVICE_UUID,
      UART_RX_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.error('[BleGateway] RX monitoring error:', error);
          return;
        }

        if (!characteristic || !characteristic.value) {
          return;
        }

        try {
          // Décoder base64 → Uint8Array binaire
          const binaryData = this.base64ToUint8Array(characteristic.value);
          console.log('[BleGateway] Received packet:', binaryData.length, 'bytes');

          // Décoder paquet MeshCore binaire
          const packet = decodeMeshCorePacket(binaryData);
          if (packet && this.messageHandler) {
            this.messageHandler(packet);
          }
        } catch (err) {
          console.error('[BleGateway] Failed to decode packet:', err);
        }
      }
    );

    console.log('[BleGateway] Subscribed to notifications');
  }

  /**
   * Envoie un paquet MeshCore au gateway (Mobile → ESP32 → LoRa)
   */
  async sendPacket(packet: MeshCorePacket): Promise<void> {
    if (!this.device) {
      throw new Error('Not connected to gateway');
    }

    console.log('[BleGateway] Sending packet:', {
      type: packet.type,
      from: packet.fromNodeId.toString(16),
      to: packet.toNodeId.toString(16),
      ttl: packet.ttl,
    });

    try {
      // Encoder en binaire
      const binaryData = encodeMeshCorePacket(packet);

      // Convertir en base64 pour BLE
      const base64Data = this.uint8ArrayToBase64(binaryData);

      // Chunking si trop long (MTU=512, safe à 240)
      const chunks = this.chunkMessage(base64Data, 240);

      for (const chunk of chunks) {
        await this.device.writeCharacteristicWithResponseForService(
          UART_SERVICE_UUID,
          UART_TX_CHAR_UUID,
          chunk
        );
      }

      console.log(`[BleGateway] Packet sent (${chunks.length} chunks, ${binaryData.length} bytes)`);
    } catch (error) {
      console.error('[BleGateway] Send error:', error);
      throw error;
    }
  }

  /**
   * Déconnecte du gateway
   */
  async disconnect(): Promise<void> {
    if (this.device) {
      console.log('[BleGateway] Disconnecting...');
      await this.device.cancelConnection();
      this.device = null;
      this.rxCharacteristic = null;
      console.log('[BleGateway] Disconnected');
    }
  }

  /**
   * Enregistre un handler pour les messages entrants
   */
  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  /**
   * Vérifie si connecté
   */
  isConnected(): boolean {
    return this.device !== null;
  }

  /**
   * Retourne le device connecté
   */
  getConnectedDevice(): BleGatewayDevice | null {
    if (!this.device) return null;

    return {
      id: this.device.id,
      name: this.device.name || 'Unknown',
      rssi: this.device.rssi || -100,
    };
  }

  /**
   * Nettoie les ressources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.manager.destroy();
  }

  /**
   * Utils : String → Base64
   */
  private stringToBase64(str: string): string {
    // React Native a btoa global
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }

  /**
   * Utils : Base64 → String
   */
  private base64ToString(base64: string): string {
    // React Native a atob global
    return decodeURIComponent(
      Array.from(atob(base64))
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }

  /**
   * Utils : Uint8Array → Base64
   */
  private uint8ArrayToBase64(data: Uint8Array): string {
    const binaryString = Array.from(data)
      .map((byte) => String.fromCharCode(byte))
      .join('');
    return btoa(binaryString);
  }

  /**
   * Utils : Base64 → Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Chunking : Split message en morceaux de N bytes
   */
  private chunkMessage(base64Data: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < base64Data.length; i += chunkSize) {
      chunks.push(base64Data.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

/**
 * Singleton instance
 */
let bleGatewayInstance: BleGatewayClient | null = null;

export function getBleGatewayClient(): BleGatewayClient {
  if (!bleGatewayInstance) {
    bleGatewayInstance = new BleGatewayClient();
  }
  return bleGatewayInstance;
}
