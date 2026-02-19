/**
 * MeshCore Provider avec meshcore.js
 * 
 * Connexion USB Serial aux devices MeshCore en utilisant la librairie officielle
 * Supporte Companion, Room Server et Repeater
 */

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { UsbSerialManager } from 'react-native-usb-serialport-for-android';
// @ts-ignore - meshcore.js n'a pas de types
import * as MeshCore from '@liamcottle/meshcore.js';

export interface MeshCoreDevice {
  id: number;
  name: string;
  vendorId: number;
  productId: number;
}

export interface MeshCoreContact {
  publicKey: string;
  advName: string;
  lastSeen: number;
}

export interface MeshCoreMessage {
  senderPublicKey: string;
  text: string;
  timestamp: number;
}

interface MeshCoreState {
  connected: boolean;
  device: MeshCoreDevice | null;
  scanning: boolean;
  availableDevices: MeshCoreDevice[];
  contacts: MeshCoreContact[];
  error: string | null;
  isCompanion: boolean;
  deviceType: 'companion' | 'roomserver' | 'repeater' | null;
}

interface MeshCoreContextValue extends MeshCoreState {
  scanForDevices: () => Promise<void>;
  connectToDevice: (deviceId: number, type?: 'companion' | 'roomserver' | 'repeater') => Promise<void>;
  disconnectDevice: () => Promise<void>;
  sendMessage: (publicKey: string, text: string) => Promise<void>;
  getContacts: () => Promise<MeshCoreContact[]>;
  getStatus: () => Promise<any>;
  // ✅ NOUVEAU: Envoi de données brutes (pour Room Server/Repeater)
  sendRawData: (data: Uint8Array) => Promise<void>;
  // Room Server specific
  getRoomServerPosts: () => Promise<any[]>;
  sendRoomServerPost: (text: string) => Promise<void>;
  // Repeater specific
  getRepeaterStatus: () => Promise<any>;
}

const MeshCoreContext = createContext<MeshCoreContextValue | null>(null);

export function useMeshCore(): MeshCoreContextValue {
  const context = useContext(MeshCoreContext);
  if (!context) {
    throw new Error('useMeshCore must be used within MeshCoreProvider');
  }
  return context;
}

export function MeshCoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MeshCoreState>({
    connected: false,
    device: null,
    scanning: false,
    availableDevices: [],
    contacts: [],
    error: null,
    isCompanion: false,
    deviceType: null,
  });

  const connectionRef = useRef<any>(null);

  // Scanner les devices USB
  const scanForDevices = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setState(prev => ({ ...prev, error: 'USB Serial only available on Android' }));
      return;
    }

    setState(prev => ({ ...prev, scanning: true }));

    try {
      const devices = await UsbSerialManager.list();
      const mappedDevices: MeshCoreDevice[] = devices.map((d: any) => ({
        id: d.deviceId,
        name: d.deviceName || `MeshCore ${d.deviceId}`,
        vendorId: d.vendorId,
        productId: d.productId,
      }));
      
      setState(prev => ({ 
        ...prev, 
        availableDevices: mappedDevices,
        scanning: false,
      }));
      console.log('[MeshCore] Found devices:', mappedDevices.length);
    } catch (err) {
      console.error('[MeshCore] Scan error:', err);
      setState(prev => ({ ...prev, scanning: false, error: 'Failed to scan USB devices' }));
    }
  }, []);

  // Connecter à un device
  const connectToDevice = useCallback(async (
    deviceId: number, 
    type: 'companion' | 'roomserver' | 'repeater' = 'companion'
  ) => {
    try {
      // ✅ Utiliser l'adapter meshcore-usb qui fonctionne avec React Native
      const { createMeshCoreAdapter } = await import('@/utils/meshcore-usb');
      const adapter = await createMeshCoreAdapter(deviceId);
      
      // Créer une connexion meshcore.js avec l'adapter
      const meshConnection = new MeshCore.NodeJSSerialConnection(adapter as any);
      
      // Attendre la connexion
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        
        meshConnection.on('connected', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        meshConnection.on('error', (err: any) => {
          clearTimeout(timeout);
          reject(err);
        });
        
        meshConnection.connect();
      });

      connectionRef.current = meshConnection;
      
      const device = state.availableDevices.find(d => d.id === deviceId);
      
      setState(prev => ({
        ...prev,
        connected: true,
        device: device || null,
        deviceType: type,
        isCompanion: type === 'companion',
        error: null,
      }));

      console.log('[MeshCore] Connected to device:', deviceId, 'Type:', type);

      // Si companion, récupérer les contacts
      if (type === 'companion') {
        const contacts = await meshConnection.getContacts();
        setState(prev => ({ ...prev, contacts }));
      }

    } catch (err) {
      console.error('[MeshCore] Connection error:', err);
      setState(prev => ({ ...prev, error: 'Failed to connect to MeshCore device' }));
    }
  }, [state.availableDevices]);

  // Déconnecter
  const disconnectDevice = useCallback(async () => {
    try {
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }
      
      setState(prev => ({
        ...prev,
        connected: false,
        device: null,
        deviceType: null,
        isCompanion: false,
        contacts: [],
      }));
      
      console.log('[MeshCore] Disconnected');
    } catch (err) {
      console.error('[MeshCore] Disconnect error:', err);
    }
  }, []);

  // Envoyer un message (Companion only)
  const sendMessage = useCallback(async (publicKey: string, text: string) => {
    if (!connectionRef.current || !state.isCompanion) {
      throw new Error('Not connected to companion device');
    }

    try {
      await connectionRef.current.sendMessage(publicKey, text);
      console.log('[MeshCore] Message sent to:', publicKey.slice(0, 16));
    } catch (err) {
      console.error('[MeshCore] Send error:', err);
      throw err;
    }
  }, [state.isCompanion]);

  // Récupérer les contacts
  const getContacts = useCallback(async (): Promise<MeshCoreContact[]> => {
    if (!connectionRef.current || !state.isCompanion) {
      return [];
    }

    try {
      const contacts = await connectionRef.current.getContacts();
      setState(prev => ({ ...prev, contacts }));
      return contacts;
    } catch (err) {
      console.error('[MeshCore] Get contacts error:', err);
      return [];
    }
  }, [state.isCompanion]);

  // Récupérer le statut
  const getStatus = useCallback(async () => {
    if (!connectionRef.current) {
      return null;
    }

    try {
      const status = await connectionRef.current.getStatus();
      return status;
    } catch (err) {
      console.error('[MeshCore] Get status error:', err);
      return null;
    }
  }, []);

  // ✅ NOUVEAU: Envoi de données brutes (pour Room Server/Repeater)
  const sendRawData = useCallback(async (data: Uint8Array) => {
    if (!connectionRef.current || !state.connected) {
      throw new Error('Not connected to MeshCore device');
    }

    try {
      // Utiliser l'adapter pour envoyer des données brutes
      await connectionRef.current.sendRaw(data);
      console.log('[MeshCore] Raw data sent:', data.length, 'bytes');
    } catch (err) {
      console.error('[MeshCore] Send raw error:', err);
      throw err;
    }
  }, [state.connected]);

  // Room Server: récupérer les posts
  const getRoomServerPosts = useCallback(async () => {
    if (!connectionRef.current || state.deviceType !== 'roomserver') {
      return [];
    }

    try {
      // Commande spécifique Room Server
      const posts = await connectionRef.current.sendCommand({ cmd: 'get_posts' });
      return posts || [];
    } catch (err) {
      console.error('[MeshCore] Get posts error:', err);
      return [];
    }
  }, [state.deviceType]);

  // Room Server: envoyer un post
  const sendRoomServerPost = useCallback(async (text: string) => {
    if (!connectionRef.current || state.deviceType !== 'roomserver') {
      throw new Error('Not connected to room server');
    }

    try {
      await connectionRef.current.sendCommand({ cmd: 'post', text });
    } catch (err) {
      console.error('[MeshCore] Send post error:', err);
      throw err;
    }
  }, [state.deviceType]);

  // Repeater: récupérer le statut
  const getRepeaterStatus = useCallback(async () => {
    if (!connectionRef.current || state.deviceType !== 'repeater') {
      return null;
    }

    try {
      const status = await connectionRef.current.sendCommand({ cmd: 'get_status' });
      return status;
    } catch (err) {
      console.error('[MeshCore] Get repeater status error:', err);
      return null;
    }
  }, [state.deviceType]);

  return (
    <MeshCoreContext.Provider
      value={{
        ...state,
        scanForDevices,
        connectToDevice,
        disconnectDevice,
        sendMessage,
        getContacts,
        getStatus,
        sendRawData,
        getRoomServerPosts,
        sendRoomServerPost,
        getRepeaterStatus,
      }}
    >
      {children}
    </MeshCoreContext.Provider>
  );
}
