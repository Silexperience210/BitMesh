/**
 * USB Serial Provider pour MeshCore (simplifié)
 * 
 * Connexion USB Serial aux devices MeshCore
 * Alternative au BLE pour connexion filaire fiable
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { 
  UsbSerialManager,
  UsbSerial,
} from 'react-native-usb-serialport-for-android';
import { type MeshCorePacket } from '@/utils/meshcore-protocol';

export interface UsbDevice {
  id: number;
  name: string;
  vendorId: number;
  productId: number;
}

interface UsbSerialState {
  connected: boolean;
  device: UsbDevice | null;
  scanning: boolean;
  availableDevices: UsbDevice[];
  error: string | null;
  hasPermission: boolean;
}

interface UsbSerialContextValue extends UsbSerialState {
  scanForDevices: () => Promise<void>;
  connectToDevice: (deviceId: number) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  sendPacket: (packet: MeshCorePacket) => Promise<void>;
  onPacket: (handler: (packet: MeshCorePacket) => void) => void;
  requestPermission: () => Promise<boolean>;
}

const UsbSerialContext = createContext<UsbSerialContextValue | null>(null);

export function useUsbSerial(): UsbSerialContextValue {
  const context = useContext(UsbSerialContext);
  if (!context) {
    throw new Error('useUsbSerial must be used within UsbSerialProvider');
  }
  return context;
}

export function UsbSerialProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UsbSerialState>({
    connected: false,
    device: null,
    scanning: false,
    availableDevices: [],
    error: null,
    hasPermission: false,
  });

  const serialRef = useRef<UsbSerial | null>(null);
  const packetHandlerRef = useRef<((packet: MeshCorePacket) => void) | null>(null);

  // Permission USB (simplifié)
  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    // La permission est gérée par la librairie automatiquement
    setState(prev => ({ ...prev, hasPermission: true }));
    return true;
  };

  // Scanner les devices USB
  const scanForDevices = async () => {
    if (Platform.OS !== 'android') {
      setState(prev => ({ ...prev, error: 'USB Serial only available on Android' }));
      return;
    }

    setState(prev => ({ ...prev, scanning: true }));

    try {
      const devices = await UsbSerialManager.list();
      const mappedDevices: UsbDevice[] = devices.map((d: any) => ({
        id: d.deviceId,
        name: d.deviceName || `USB Device ${d.deviceId}`,
        vendorId: d.vendorId,
        productId: d.productId,
      }));
      
      setState(prev => ({ 
        ...prev, 
        availableDevices: mappedDevices,
        scanning: false,
      }));
      console.log('[UsbSerial] Found devices:', mappedDevices.length);
    } catch (err) {
      console.error('[UsbSerial] Scan error:', err);
      setState(prev => ({ ...prev, scanning: false, error: 'Failed to scan USB devices' }));
    }
  };

  // Connecter à un device USB
  const connectToDevice = async (deviceId: number) => {
    try {
      // Ouvrir le port série avec config par défaut
      const serial = await (UsbSerialManager as any).open(deviceId);
      serialRef.current = serial;

      // Écouter les données reçues
      serial.onReceived((event: any) => {
        try {
          const data = event.data;
          console.log('[UsbSerial] Data received:', data);
          // TODO: Décoder le paquet MeshCore
          // const packet = decodeMeshCorePacket(data);
          // if (packet && packetHandlerRef.current) {
          //   packetHandlerRef.current(packet);
          // }
        } catch (err) {
          console.log('[UsbSerial] Failed to decode data:', err);
        }
      });

      // Trouver le device dans la liste
      const device = state.availableDevices.find(d => d.id === deviceId);
      
      setState(prev => ({
        ...prev,
        connected: true,
        device: device || null,
        error: null,
      }));

      console.log('[UsbSerial] Connected to device:', deviceId);
    } catch (err) {
      console.error('[UsbSerial] Connection error:', err);
      setState(prev => ({ ...prev, error: 'Failed to connect to USB device' }));
    }
  };

  // Déconnecter
  const disconnectDevice = async () => {
    try {
      if (serialRef.current) {
        await serialRef.current.close();
        serialRef.current = null;
      }
      
      setState(prev => ({
        ...prev,
        connected: false,
        device: null,
      }));
      
      console.log('[UsbSerial] Disconnected');
    } catch (err) {
      console.error('[UsbSerial] Disconnect error:', err);
    }
  };

  // Envoyer un paquet
  const sendPacket = async (packet: MeshCorePacket) => {
    if (!serialRef.current || !state.connected) {
      throw new Error('USB Serial not connected');
    }

    try {
      // TODO: Encoder et envoyer
      // const data = encodeMeshCorePacket(packet);
      // await serialRef.current.send(data);
      console.log('[UsbSerial] Packet sent (not implemented)');
    } catch (err) {
      console.error('[UsbSerial] Send error:', err);
      throw err;
    }
  };

  // Enregistrer un handler pour les paquets reçus
  const onPacket = (handler: (packet: MeshCorePacket) => void) => {
    packetHandlerRef.current = handler;
  };

  // Cleanup
  useEffect(() => {
    return () => {
      disconnectDevice();
    };
  }, []);

  return (
    <UsbSerialContext.Provider
      value={{
        ...state,
        scanForDevices,
        connectToDevice,
        disconnectDevice,
        sendPacket,
        onPacket,
        requestPermission,
      }}
    >
      {children}
    </UsbSerialContext.Provider>
  );
}
