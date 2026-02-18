/**
 * BLE Provider
 *
 * Gère la connexion BLE au gateway ESP32 LoRa
 * Expose l'état BLE et les fonctions scan/connect/disconnect
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleGatewayClient, getBleGatewayClient, BleGatewayDevice } from '@/utils/ble-gateway';
import { type MeshCorePacket } from '@/utils/meshcore-protocol';

interface BleState {
  connected: boolean;
  device: BleGatewayDevice | null;
  scanning: boolean;
  availableDevices: BleGatewayDevice[];
  error: string | null;
}

interface BleContextValue extends BleState {
  scanForGateways: () => Promise<void>;
  connectToGateway: (deviceId: string) => Promise<void>;
  disconnectGateway: () => Promise<void>;
  sendPacket: (packet: MeshCorePacket) => Promise<void>;
  onPacket: (handler: (packet: MeshCorePacket) => void) => void;
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
    device: null,
    scanning: false,
    availableDevices: [],
    error: null,
  });

  const clientRef = useRef<BleGatewayClient | null>(null);

  useEffect(() => {
    // Initialiser le client BLE
    const initBle = async () => {
      try {
        // Demander les permissions BLE sur Android
        if (Platform.OS === 'android') {
          await requestAndroidPermissions();
        }

        const client = getBleGatewayClient();
        await client.initialize();
        clientRef.current = client;

        console.log('[BleProvider] BLE initialized');
      } catch (error: any) {
        console.error('[BleProvider] Initialization error:', error);
        setState((prev) => ({
          ...prev,
          error: error.message || 'Failed to initialize BLE',
        }));
      }
    };

    initBle();

    // Cleanup au démontage
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect().catch(console.error);
      }
    };
  }, []);

  /**
   * Demande les permissions BLE sur Android
   */
  const requestAndroidPermissions = async () => {
    if (Platform.OS !== 'android') return;

    const apiLevel = Platform.Version;

    if (apiLevel >= 31) {
      // Android 12+ (API 31+)
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
      // Android <12
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      if (granted !== 'granted') {
        throw new Error('Location permission required for BLE scanning');
      }
    }
  };

  /**
   * Scanne les gateways BLE disponibles
   */
  const scanForGateways = async () => {
    if (!clientRef.current) {
      throw new Error('BLE not initialized');
    }

    setState((prev) => ({ ...prev, scanning: true, availableDevices: [], error: null }));

    try {
      const foundDevices: BleGatewayDevice[] = [];

      await clientRef.current.scanForGateways((device) => {
        foundDevices.push(device);
        setState((prev) => ({
          ...prev,
          availableDevices: [...foundDevices],
        }));
      }, 10000); // 10s scan

      setState((prev) => ({ ...prev, scanning: false }));

      console.log(`[BleProvider] Scan complete: ${foundDevices.length} devices found`);
    } catch (error: any) {
      console.error('[BleProvider] Scan error:', error);
      setState((prev) => ({
        ...prev,
        scanning: false,
        error: error.message || 'Scan failed',
      }));
    }
  };

  /**
   * Connecte à un gateway
   */
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
      }));

      console.log(`[BleProvider] Connected to ${device?.name}`);
    } catch (error: any) {
      console.error('[BleProvider] Connection error:', error);
      setState((prev) => ({
        ...prev,
        error: error.message || 'Connection failed',
      }));
      throw error;
    }
  };

  /**
   * Déconnecte du gateway
   */
  const disconnectGateway = async () => {
    if (!clientRef.current) return;

    try {
      await clientRef.current.disconnect();

      setState((prev) => ({
        ...prev,
        connected: false,
        device: null,
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

  /**
   * Envoie un paquet MeshCore via BLE → LoRa
   */
  const sendPacket = async (packet: MeshCorePacket) => {
    if (!clientRef.current || !state.connected) {
      throw new Error('Not connected to gateway');
    }

    await clientRef.current.sendPacket(packet);
  };

  /**
   * Enregistre un handler pour les paquets entrants
   */
  const onPacket = (handler: (packet: MeshCorePacket) => void) => {
    if (clientRef.current) {
      clientRef.current.onMessage(handler);
    }
  };

  const contextValue: BleContextValue = {
    ...state,
    scanForGateways,
    connectToGateway,
    disconnectGateway,
    sendPacket,
    onPacket,
  };

  return <BleContext.Provider value={contextValue}>{children}</BleContext.Provider>;
}
