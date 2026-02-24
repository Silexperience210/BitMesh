/**
 * BLE Provider
 *
 * Gère la connexion BLE au gateway ESP32 LoRa
 * Expose l'état BLE et les fonctions scan/connect/disconnect
 *
 * V3.0: Protocole natif MeshCore Companion (CMD_SEND_TXT_MSG, channels, contacts)
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';
import {
  BleGatewayClient,
  getBleGatewayClient,
  BleGatewayDevice,
  BleDeviceInfo,
  MeshCoreContact,
  MeshCoreIncomingMsg,
} from '@/utils/ble-gateway';
import { type MeshCorePacket } from '@/utils/meshcore-protocol';
import { getMessageRetryService } from '@/services/MessageRetryService';
import { getBackgroundBleService } from '@/services/BackgroundBleService';

const BLE_LAST_DEVICE_KEY = 'ble_last_device_id';

interface BleState {
  connected: boolean;
  loraActive: boolean;  // true = au moins un paquet LoRa reçu/envoyé avec succès
  device: BleGatewayDevice | null;
  deviceInfo: BleDeviceInfo | null;
  scanning: boolean;
  availableDevices: BleGatewayDevice[];
  error: string | null;
  currentChannel: number;          // 0=public, 1-N=privé chiffré
  meshContacts: MeshCoreContact[]; // contacts syncés du device MeshCore
}

interface BleContextValue extends BleState {
  scanForGateways: () => Promise<void>;
  connectToGateway: (deviceId: string) => Promise<void>;
  disconnectGateway: () => Promise<void>;
  sendPacket: (packet: MeshCorePacket, timeoutMs?: number) => Promise<void>;
  onPacket: (handler: (packet: MeshCorePacket) => void) => void;
  confirmLoraActive: () => void;
  // Protocole natif MeshCore Companion
  sendDirectMessage: (pubkeyHex: string, text: string) => Promise<void>;
  sendChannelMessage: (text: string) => Promise<void>; // utilise currentChannel
  setChannel: (idx: number) => void;
  syncContacts: () => Promise<void>;
  sendSelfAdvert: () => Promise<void>;
  onBleMessage: (cb: (msg: MeshCoreIncomingMsg) => void) => void;
}

const BleContext = createContext<BleContextValue | null>(null);

export function useBle(): BleContextValue {
  const context = useContext(BleContext);
  if (!context) {
    throw new Error('useBle must be used within BleProvider');
  }
  return context;
}

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BleState>({
    connected: false,
    loraActive: false,
    device: null,
    deviceInfo: null,
    scanning: false,
    availableDevices: [],
    error: null,
    currentChannel: 0,
    meshContacts: [],
  });

  const clientRef = useRef<BleGatewayClient | null>(null);
  const retryServiceRef = useRef(getMessageRetryService());
  const incomingMessageCallbackRef = useRef<((msg: MeshCoreIncomingMsg) => void) | null>(null);

  useEffect(() => {
    const initBle = async () => {
      try {
        if (Platform.OS === 'android') {
          await requestAndroidPermissions();
        }

        const client = getBleGatewayClient();
        await client.initialize();
        clientRef.current = client;

        client.onDeviceInfo((info) => {
          setState((prev) => ({ ...prev, deviceInfo: info }));
        });

        // Callback : message direct ou channel reçu via firmware natif
        client.onIncomingMessage((msg) => {
          setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
          incomingMessageCallbackRef.current?.(msg);
        });

        // Callback : nœud découvert via PUSH_ADVERT
        client.onContactDiscovered((contact) => {
          setState((prev) => ({
            ...prev,
            meshContacts: [
              ...prev.meshContacts.filter(c => c.pubkeyHex !== contact.pubkeyHex),
              contact,
            ],
          }));
        });

        // Callback : liste complète des contacts chargée depuis le device
        client.onContacts((contacts) => {
          console.log(`[BleProvider] ${contacts.length} contacts chargés depuis device`);
          setState((prev) => ({ ...prev, meshContacts: contacts }));
        });

        // Callback : confirmation ACK reçu
        client.onSendConfirmed((ackCode, rtt) => {
          console.log(`[BleProvider] Message confirmé ACK:${ackCode} RTT:${rtt}ms`);
        });

        console.log('[BleProvider] BLE initialized');

        // Auto-reconnect au dernier appareil connu
        try {
          const lastDeviceId = await AsyncStorage.getItem(BLE_LAST_DEVICE_KEY);
          if (lastDeviceId) {
            console.log('[BleProvider] Auto-reconnect à:', lastDeviceId);
            await client.connect(lastDeviceId);
            const device = client.getConnectedDevice();
            setState((prev) => ({ ...prev, connected: true, device }));
            console.log('[BleProvider] Auto-reconnect réussi:', device?.name);
          }
        } catch (reconnectErr) {
          console.log('[BleProvider] Auto-reconnect échoué (appareil hors portée)');
        }
      } catch (error: any) {
        console.error('[BleProvider] Initialization error:', error);
        setState((prev) => ({
          ...prev,
          error: error.message || 'Failed to initialize BLE',
        }));
      }
    };

    initBle();

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect().catch(console.error);
      }
      retryServiceRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (state.connected) {
      retryServiceRef.current.start();
      getBackgroundBleService().register().catch(console.error);
      console.log('[BleProvider] Services démarrés');
    } else {
      retryServiceRef.current.stop();
    }
  }, [state.connected]);

  const requestAndroidPermissions = async () => {
    if (Platform.OS !== 'android') return;

    const apiLevel = Platform.Version;

    if (apiLevel >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      if (
        granted['android.permission.BLUETOOTH_SCAN'] !== 'granted' ||
        granted['android.permission.BLUETOOTH_CONNECT'] !== 'granted'
      ) {
        throw new Error('BLE permissions not granted');
      }
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      if (granted !== 'granted') {
        throw new Error('Location permission required for BLE scanning');
      }
    }
  };

  const scanForGateways = async () => {
    // Initialiser le client si nécessaire (pour connect/disconnect)
    if (!clientRef.current) {
      try {
        if (Platform.OS === 'android') {
          await requestAndroidPermissions();
        }
        const client = getBleGatewayClient();
        await client.initialize();
        clientRef.current = client;
        client.onDeviceInfo((info) => {
          setState((prev) => ({ ...prev, deviceInfo: info }));
        });
      } catch (initErr: any) {
        const msg = initErr.message || 'Bluetooth non disponible';
        setState((prev) => ({ ...prev, error: msg }));
        throw new Error(msg);
      }
    }

    setState((prev) => ({ ...prev, scanning: true, availableDevices: [], error: null }));

    try {
      // Vérifier que BT est actif
      await BleManager.start({ showAlert: false });
      const bleState = await BleManager.checkState();
      if (bleState !== 'on') {
        throw new Error(`Bluetooth éteint (état: ${bleState}). Allumez le Bluetooth.`);
      }

      const found: BleGatewayDevice[] = [];
      const seen = new Set<string>();

      const handlePeripheral = (peripheral: any) => {
        if (!peripheral?.id || seen.has(peripheral.id)) return;
        seen.add(peripheral.id);
        const name: string = peripheral.name || peripheral.advertising?.localName || '';
        const displayName = name || `BLE (${peripheral.id.slice(0, 8)})`;
        const isMeshCore = displayName.startsWith('MeshCore-') || displayName.startsWith('Whisper-');
        const device: BleGatewayDevice = {
          id: peripheral.id,
          name: displayName,
          rssi: peripheral.rssi || -100,
          type: isMeshCore ? 'companion' : 'gateway',
        };
        found.push(device);
        setState((prev) => ({ ...prev, availableDevices: [...found] }));
        console.log(`[BleProvider] Trouvé: "${displayName}" RSSI ${peripheral.rssi}`);
      };

      // ── Stratégie 1 : UUID NUS filter (comme MeshMapper officiel) ─────
      // MeshCore firmware T-Beam annonce toujours le service Nordic UART
      // L'UUID filter = hardware-level filter Android → plus fiable, pas de throttle
      const NUS_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
      console.log('[BleProvider] Scan NUS UUID filter (stratégie MeshMapper)...');
      const listener1 = BleManager.onDiscoverPeripheral(handlePeripheral);
      await BleManager.scan({
        serviceUUIDs: [NUS_UUID],
        seconds: 10,
        allowDuplicates: false,
        scanMode: 2,
        matchMode: 1,
      } as any);
      await new Promise((res) => setTimeout(res, 10000));
      listener1.remove();
      try { await BleManager.stopScan(); } catch (_) {}
      console.log(`[BleProvider] Scan NUS → ${found.length} device(s)`);

      // ── Stratégie 2 : Scan universel (fallback si UUID filter trouve rien) ──
      // Sur certains firmware l'UUID n'est pas dans l'ADV primary → fallback scan-all
      if (found.length === 0) {
        console.log('[BleProvider] Fallback scan universel (10s)...');
        const listener2 = BleManager.onDiscoverPeripheral(handlePeripheral);
        await BleManager.scan({
          serviceUUIDs: [],
          seconds: 10,
          allowDuplicates: false,
          scanMode: 2,
          matchMode: 1,
        } as any);
        await new Promise((res) => setTimeout(res, 10000));
        listener2.remove();
        try { await BleManager.stopScan(); } catch (_) {}
        console.log(`[BleProvider] Scan universel → ${found.length} device(s)`);
      }

      // ── Stratégie 3 : getDiscoveredPeripherals() (cache BleManager) ───
      if (found.length === 0) {
        try {
          const cached: any[] = await BleManager.getDiscoveredPeripherals();
          cached.forEach(handlePeripheral);
          console.log(`[BleProvider] Cache BleManager → ${found.length} device(s)`);
        } catch (_) {}
      }

      console.log(`[BleProvider] Scan terminé — ${found.length} device(s) au total`);
      setState((prev) => ({ ...prev, scanning: false }));
    } catch (error: any) {
      console.error('[BleProvider] Scan error:', error);
      setState((prev) => ({
        ...prev,
        scanning: false,
        error: error.message || 'Scan failed',
      }));
      throw error;
    }
  };

  const connectToGateway = async (deviceId: string) => {
    if (!clientRef.current) {
      throw new Error('BLE not initialized');
    }

    setState((prev) => ({ ...prev, error: null }));

    try {
      await clientRef.current.connect(deviceId);

      const device = clientRef.current.getConnectedDevice();

      setState((prev) => ({
        ...prev,
        connected: true,
        device,
        meshContacts: [], // Reset contacts, seront rechargés via getContacts()
      }));

      await AsyncStorage.setItem(BLE_LAST_DEVICE_KEY, deviceId);
      console.log(`[BleProvider] Connected to ${device?.name}`);
    } catch (error: any) {
      console.error('[BleProvider] Connection error:', error);
      const msg: string = error?.message ?? String(error);
      const isAuthErr =
        msg.includes('133') ||
        msg.includes('insufficient') ||
        msg.includes('authentication') ||
        msg.includes('bonding') ||
        msg.includes('pairing');
      const displayMsg = isAuthErr
        ? 'Appairage BLE requis. Allez dans Paramètres → Bluetooth, supprimez "MeshCore-..." puis relancez. PIN : 123456'
        : msg || 'Connection failed';
      setState((prev) => ({ ...prev, error: displayMsg }));
      throw error;
    }
  };

  const disconnectGateway = async () => {
    if (!clientRef.current) return;

    try {
      await clientRef.current.disconnect();
      await AsyncStorage.removeItem(BLE_LAST_DEVICE_KEY);

      setState((prev) => ({
        ...prev,
        connected: false,
        loraActive: false,
        device: null,
        meshContacts: [],
        currentChannel: 0,
      }));

      console.log('[BleProvider] Disconnected');
    } catch (error: any) {
      console.error('[BleProvider] Disconnect error:', error);
      setState((prev) => ({
        ...prev,
        error: error.message || 'Disconnect failed',
      }));
    }
  };

  const sendPacket = async (packet: MeshCorePacket, timeoutMs = 10000) => {
    if (!clientRef.current || !state.connected) {
      const msgId = `pending-${Date.now()}`;
      await retryServiceRef.current.queueMessage(msgId, packet);
      console.log(`[BleProvider] Message mis en file d'attente persistante: ${msgId}`);
      return;
    }

    try {
      await Promise.race([
        clientRef.current.sendPacket(packet),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('BLE timeout')), timeoutMs)
        )
      ]);
    } catch (error) {
      const msgId = `retry-${Date.now()}`;
      await retryServiceRef.current.queueMessage(msgId, packet);
      console.log(`[BleProvider] Échec envoi, message en file d'attente: ${msgId}`);
      throw error;
    }
  };

  const onPacket = (handler: (packet: MeshCorePacket) => void) => {
    if (clientRef.current) {
      clientRef.current.onMessage((packet) => {
        setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
        handler(packet);
      });
    }
  };

  const confirmLoraActive = () => {
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  // ── Protocole natif MeshCore Companion ─────────────────────────

  const sendDirectMessage = async (pubkeyHex: string, text: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    const prefix6 = new Uint8Array(Buffer.from(pubkeyHex.slice(0, 12), 'hex'));
    await clientRef.current.sendDirectMessage(prefix6, text);
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  const sendChannelMessage = async (text: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    await clientRef.current.sendChannelMessage(state.currentChannel, text);
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  const setChannel = (idx: number) => {
    setState((prev) => ({ ...prev, currentChannel: idx }));
    console.log(`[BleProvider] Channel → ch${idx}`);
  };

  const syncContacts = async () => {
    if (!clientRef.current || !state.connected) return;
    await clientRef.current.getContacts();
  };

  const sendSelfAdvert = async () => {
    if (!clientRef.current || !state.connected) return;
    await clientRef.current.sendSelfAdvert(1);
  };

  const onBleMessage = (cb: (msg: MeshCoreIncomingMsg) => void) => {
    incomingMessageCallbackRef.current = cb;
  };

  const contextValue: BleContextValue = {
    ...state,
    scanForGateways,
    connectToGateway,
    disconnectGateway,
    sendPacket,
    onPacket,
    confirmLoraActive,
    sendDirectMessage,
    sendChannelMessage,
    setChannel,
    syncContacts,
    sendSelfAdvert,
    onBleMessage,
  };

  return <BleContext.Provider value={contextValue}>{children}</BleContext.Provider>;
}
