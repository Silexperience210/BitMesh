/**
 * BLE Provider - VERSION CORRIGÉE
 *
 * Gère la connexion BLE au gateway ESP32 LoRa
 * Expose l'état BLE et les fonctions scan/connect/disconnect
 *
 * V3.1: Protocole natif MeshCore Companion avec broadcast flood corrigé
 * CORRECTIONS:
 * - Configuration automatique du canal 0 (public)
 * - sendFloodMessage() pour broadcast
 * - Logs détaillés pour debugging
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
} from '@/utils/ble-gateway-fixed';
import { type MeshCorePacket } from '@/utils/meshcore-protocol';
import { getMessageRetryService } from '@/services/MessageRetryService';
import { getBackgroundBleService } from '@/services/BackgroundBleService';

const BLE_LAST_DEVICE_KEY = 'ble_last_device_id';

interface BleState {
  connected: boolean;
  loraActive: boolean;
  device: BleGatewayDevice | null;
  deviceInfo: BleDeviceInfo | null;
  error: string | null;
  currentChannel: number;
  meshContacts: MeshCoreContact[];
  channelConfigured: boolean; // CORRECTION: état de config du canal
}

interface BleContextValue extends BleState {
  connectToGateway: (deviceId: string, scannedName?: string) => Promise<void>;
  disconnectGateway: () => Promise<void>;
  sendPacket: (packet: MeshCorePacket, timeoutMs?: number) => Promise<void>;
  onPacket: (handler: (packet: MeshCorePacket) => void) => () => void;
  offPacket: () => void;
  confirmLoraActive: () => void;
  
  // Protocole natif MeshCore Companion
  sendDirectMessage: (pubkeyHex: string, text: string) => Promise<void>;
  sendChannelMessage: (text: string) => Promise<void>;
  sendFloodMessage: (text: string) => Promise<void>; // CORRECTION: nouveau
  setChannel: (idx: number) => void;
  syncContacts: () => Promise<void>;
  sendSelfAdvert: () => Promise<void>;
  configureChannel: (index: number, name: string, secret: string) => Promise<void>; // CORRECTION: nouveau
  
  // Callbacks
  onBleMessage: (cb: (msg: MeshCoreIncomingMsg) => void) => () => void;
  offBleMessage: () => void;
  onSendConfirmed: (cb: (ackCode: number, roundTripMs: number) => void) => () => void;
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
    error: null,
    currentChannel: 0,
    meshContacts: [],
    channelConfigured: false,
  });

  const clientRef = useRef<BleGatewayClient | null>(null);
  const retryServiceRef = useRef(getMessageRetryService());
  const incomingMessageCallbackRef = useRef<((msg: MeshCoreIncomingMsg) => void) | null>(null);
  const pendingDeviceNameRef = useRef<string>('');

  useEffect(() => {
    const initBle = async () => {
      try {
        if (Platform.OS === 'android') {
          try {
            await requestAndroidPermissions();
          } catch (permErr) {
            console.warn('[BleProvider] Permissions BLE non accordées au lancement:', permErr);
          }
        }

        const client = getBleGatewayClient();
        await client.initialize();
        clientRef.current = client;

        // Callback: Device info reçue
        client.onDeviceInfo((info) => {
          console.log('[BleProvider] Device info reçue:', info.name);
          setState((prev) => ({
            ...prev,
            deviceInfo: info,
            device: prev.device ? { ...prev.device, name: info.name } : null,
          }));
        });

        // CORRECTION: Callback message reçu avec logs améliorés
        client.onIncomingMessage((msg) => {
          console.log(`[BleProvider] 📨 Message ${msg.type} reçu:`, 
            msg.text.substring(0, 30) + (msg.text.length > 30 ? '...' : ''));
          
          setState((prev) => ({
            ...prev,
            loraActive: true,
          }));
          incomingMessageCallbackRef.current?.(msg);
        });

        // Callback: Contact découvert
        client.onContactDiscovered((contact) => {
          setState((prev) => ({
            ...prev,
            meshContacts: [
              ...prev.meshContacts.filter(c => c.pubkeyHex !== contact.pubkeyHex),
              contact,
            ],
          }));
        });

        // Callback: Liste contacts chargée
        client.onContacts((contacts) => {
          console.log(`[BleProvider] ${contacts.length} contacts chargés depuis device`);
          setState((prev) => ({ ...prev, meshContacts: contacts }));
        });

        // CORRECTION: Callback ACK avec confirmation
        client.onSendConfirmed((ackCode, rtt) => {
          console.log(`[BleProvider] ✓ Message confirmé ACK:${ackCode} RTT:${rtt}ms`);
          Alert.alert(
            '✅ Message Confirmé',
            `Votre message a été transmis sur le réseau LoRa et confirmé.\n\nACK: ${ackCode}\nTemps aller-retour: ${rtt}ms`
          );
        });

        // Callback: Déconnexion
        client.onDisconnect(() => {
          console.log('[BleProvider] Déconnexion détectée — reset état');
          setState((prev) => ({
            ...prev,
            connected: false,
            loraActive: false,
            device: null,
            channelConfigured: false,
          }));
        });

        console.log('[BleProvider] BLE initialized');

        // Auto-reconnect
        let lastDeviceId: string | null = null;
        try {
          lastDeviceId = await AsyncStorage.getItem(BLE_LAST_DEVICE_KEY);
          if (lastDeviceId) {
            console.log('[BleProvider] Auto-reconnect à:', lastDeviceId);
            await Promise.race([
              client.connect(lastDeviceId),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('auto-reconnect timeout')), 8000)
              ),
            ]);
            const device = client.getConnectedDevice();
            
            // CORRECTION: Vérifier si le canal est configuré après connexion
            const channelConfig = client.getChannelConfig(0);
            
            setState((prev) => ({
              ...prev,
              connected: true,
              device,
              channelConfigured: channelConfig?.configured || false,
            }));
            console.log('[BleProvider] Auto-reconnect réussi:', device?.name);
          }
        } catch (reconnectErr) {
          console.log('[BleProvider] Auto-reconnect échoué');
          if (lastDeviceId) {
            BleManager.disconnect(lastDeviceId).catch(() => {});
          }
          client.disconnect().catch(() => {});
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

  const connectToGateway = async (deviceId: string, scannedName?: string) => {
    if (!clientRef.current) {
      throw new Error('BLE not initialized');
    }

    if (scannedName) {
      pendingDeviceNameRef.current = scannedName;
    }

    setState((prev) => ({ ...prev, error: null }));

    try {
      await clientRef.current.connect(deviceId);

      const device = clientRef.current.getConnectedDevice();
      const displayDevice = device ? {
        ...device,
        name: device.name === 'MeshCore' && pendingDeviceNameRef.current 
          ? pendingDeviceNameRef.current 
          : device.name
      } : null;

      // CORRECTION: Vérifier la config du canal après connexion
      const channelConfig = clientRef.current.getChannelConfig(0);
      console.log('[BleProvider] Canal 0 configuré:', channelConfig?.configured);

      setState((prev) => ({
        ...prev,
        connected: true,
        device: displayDevice,
        meshContacts: [],
        channelConfigured: channelConfig?.configured || false,
      }));

      await AsyncStorage.setItem(BLE_LAST_DEVICE_KEY, deviceId);
      if (__DEV__) console.log(`[BleProvider] Connected to ${displayDevice?.name}`);
      
      // CORRECTION: Alerte si le canal n'est pas configuré
      if (!channelConfig?.configured) {
        console.warn('[BleProvider] Canal 0 non configuré après connexion');
      }
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
        ? 'Erreur d\'appairage BLE. Vérifiez le PIN dans le modal de scan (défaut: 123456).'
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
        channelConfigured: false,
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

  const onPacket = (handler: (packet: MeshCorePacket) => void): (() => void) => {
    if (clientRef.current) {
      clientRef.current.onMessage((packet) => {
        setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
        handler(packet);
      });
    }
    return () => {
      if (clientRef.current) {
        clientRef.current.onMessage(() => {});
      }
    };
  };

  const offPacket = () => {
    if (clientRef.current) {
      clientRef.current.onMessage(() => {});
    }
  };

  const confirmLoraActive = () => {
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  // ── Protocole natif MeshCore Companion ─────────────────────────

  const sendDirectMessage = async (pubkeyHex: string, text: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    if (!pubkeyHex || pubkeyHex.length < 12) {
      throw new Error('Clé publique destinataire invalide (trop courte)');
    }
    const prefixHex = pubkeyHex.slice(0, 12);
    if (!/^[0-9a-fA-F]{12}$/.test(prefixHex)) {
      throw new Error('Clé publique destinataire invalide (format hex attendu)');
    }
    const prefix6 = new Uint8Array(Buffer.from(prefixHex, 'hex'));
    if (__DEV__) {
      console.log(`[BleProvider] Envoi DM vers prefix: ${prefixHex}`);
    }
    await clientRef.current.sendDirectMessage(prefix6, text);
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  const sendChannelMessage = async (text: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    
    // CORRECTION: Vérifier que le canal est configuré
    if (!state.channelConfigured && state.currentChannel === 0) {
      console.warn('[BleProvider] Canal 0 peut ne pas être configuré, tentative d\'envoi quand même...');
    }
    
    await clientRef.current.sendChannelMessage(state.currentChannel, text);
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  // CORRECTION: Nouvelle fonction sendFloodMessage
  const sendFloodMessage = async (text: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    
    console.log('[BleProvider] 🚀 Envoi broadcast flood:', text.substring(0, 30));
    
    // Le canal 0 est le canal public pour les broadcasts
    await clientRef.current.sendChannelMessage(0, text);
    
    setState((prev) => prev.loraActive ? prev : { ...prev, loraActive: true });
  };

  // CORRECTION: Fonction pour configurer un canal manuellement
  const configureChannel = async (index: number, name: string, secret: string) => {
    if (!clientRef.current || !state.connected) throw new Error('BLE non connecté');
    
    const secretBytes = new Uint8Array(32);
    const secretData = new TextEncoder().encode(secret);
    secretBytes.set(secretData.slice(0, 32));
    
    await clientRef.current.setChannel(index, name, secretBytes);
    
    if (index === state.currentChannel) {
      setState((prev) => ({ ...prev, channelConfigured: true }));
    }
    
    console.log(`[BleProvider] Canal ${index} configuré: "${name}"`);
  };

  const setChannel = (idx: number) => {
    setState((prev) => ({ 
      ...prev, 
      currentChannel: idx,
      // Vérifier si le nouveau canal est configuré
      channelConfigured: clientRef.current?.getChannelConfig(idx)?.configured || false
    }));
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

  const onBleMessage = (cb: (msg: MeshCoreIncomingMsg) => void): (() => void) => {
    incomingMessageCallbackRef.current = cb;
    return () => {
      incomingMessageCallbackRef.current = null;
    };
  };

  const offBleMessage = () => {
    incomingMessageCallbackRef.current = null;
  };

  const onSendConfirmed = (cb: (ackCode: number, roundTripMs: number) => void): (() => void) => {
    if (clientRef.current) {
      clientRef.current.onSendConfirmed(cb);
    }
    return () => {
      if (clientRef.current) {
        clientRef.current.onSendConfirmed(() => {});
      }
    };
  };

  const contextValue: BleContextValue = {
    ...state,
    connectToGateway,
    disconnectGateway,
    sendPacket,
    onPacket,
    offPacket,
    confirmLoraActive,
    sendDirectMessage,
    sendChannelMessage,
    sendFloodMessage, // CORRECTION: exposé
    setChannel,
    syncContacts,
    sendSelfAdvert,
    configureChannel, // CORRECTION: exposé
    onBleMessage,
    offBleMessage,
    onSendConfirmed,
  };

  return <BleContext.Provider value={contextValue}>{children}</BleContext.Provider>;
}

export default BleProvider;
