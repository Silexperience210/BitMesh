/**
 * BleProviderComplete - Context React pour MeshCore
 * 
 * Fonctionnalités:
 * - Connexion/déconnexion BLE
 * - Synchronisation automatique des contacts
 * - Envoi/réception de messages
 * - Gestion des ACKs et confirmations
 * - Cache des adverts reçus
 * - Reconnexion automatique
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';

import {
  BleGatewayComplete,
  bleGateway as defaultGateway,
} from '../utils/ble-gateway-complete';

import {
  MeshContact,
  MeshMessage,
  SendConfirmation,
  DeviceInfo,
  AdvertInfo,
  PathUpdate,
  MeshLogEvent,
  PendingMessage,
  BleDevice,
  LIMITS,
  generateNodeId,
  createMinimalContact,
} from '../types/meshcore';

// ============================================================================
// INTERFACES
// ============================================================================

interface BleContextValue {
  // État
  connected: boolean;
  connecting: boolean;
  device: BleDevice | null;
  deviceInfo: DeviceInfo | null;
  error: string | null;
  
  // Données
  meshContacts: MeshContact[];
  messages: MeshMessage[];
  pendingMessages: PendingMessage[];
  adverts: AdvertInfo[];
  logs: MeshLogEvent[];
  
  // Flags
  syncingContacts: boolean;
  scanning: boolean;
  
  // Actions
  scanForDevices: (duration?: number) => Promise<BleDevice[]>;
  connectToDevice: (deviceId: string, name?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  
  // Contacts
  syncContacts: () => Promise<void>;
  addContact: (pubkeyHex: string, name?: string) => Promise<void>;
  getContactByPubkey: (pubkeyHex: string) => MeshContact | undefined;
  
  // Messages
  sendDirectMessage: (pubkeyHex: string, text: string) => Promise<void>;
  sendChannelMessage: (channelIndex: number, text: string) => Promise<void>;
  sendFloodMessage: (text: string) => Promise<void>;
  
  // Canaux
  getChannelInfo: (index: number) => Promise<any>;
  
  // Utilitaires
  clearError: () => void;
  clearLogs: () => void;
  getStats: () => any;
}

// ============================================================================
// CONTEXT
// ============================================================================

const BleContext = createContext<BleContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface BleProviderProps {
  children: ReactNode;
  gateway?: BleGatewayComplete;
}

export function BleProviderComplete({
  children,
  gateway = defaultGateway,
}: BleProviderProps) {
  // -------------------------------------------------------------------------
  // ÉTAT
  // -------------------------------------------------------------------------
  
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [device, setDevice] = useState<BleDevice | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [meshContacts, setMeshContacts] = useState<MeshContact[]>([]);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [adverts, setAdverts] = useState<AdvertInfo[]>([]);
  const [logs, setLogs] = useState<MeshLogEvent[]>([]);
  
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [scanning, setScanning] = useState(false);
  
  // Réfs
  const gatewayRef = useRef(gateway);
  const messageIdRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDeviceIdRef = useRef<string | null>(null);
  
  // -------------------------------------------------------------------------
  // INITIALISATION
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const init = async () => {
      try {
        await gatewayRef.current.initialize();
        log('info', 'BLE Gateway initialized');
        
        // Charger le dernier device connecté
        const lastDevice = await AsyncStorage.getItem('lastMeshDevice');
        if (lastDevice) {
          lastDeviceIdRef.current = lastDevice;
        }
      } catch (err: any) {
        log('error', 'Failed to initialize BLE', err.message);
      }
    };
    
    init();
    
    return () => {
      gatewayRef.current.disconnect();
    };
  }, []);
  
  // -------------------------------------------------------------------------
  // ÉCOUTEURS BLE
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const BleManagerModule = NativeModules.BleManager;
    const bleEmitter = new NativeEventEmitter(BleManagerModule);
    
    // Écouter les données reçues
    const handleUpdateValueForCharacteristic = (data: any) => {
      if (data.characteristic === '6E400003-B5A3-F393-E0A9-E50E24DCCA9E') {
        gatewayRef.current.handleBleData(data.value);
      }
    };
    
    // Écouter les déconnexions
    const handleDisconnectPeripheral = (data: any) => {
      log('warn', 'BLE disconnected', data);
      setConnected(false);
      setDeviceInfo(null);
      
      // Tentative de reconnexion si c'était notre device
      if (lastDeviceIdRef.current && data.peripheral === lastDeviceIdRef.current) {
        scheduleReconnect();
      }
    };
    
    const listeners = [
      bleEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleUpdateValueForCharacteristic
      ),
      bleEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnectPeripheral
      ),
    ];
    
    return () => {
      listeners.forEach(l => l.remove());
    };
  }, []);
  
  // -------------------------------------------------------------------------
  // ÉCOUTEURS GATEWAY
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const g = gatewayRef.current;
    
    const unsubs = [
      // Device info
      g.onDeviceInfo((info) => {
        setDeviceInfo(info);
        log('info', `Device ready: ${info.name || 'MeshCore'}`);
      }),
      
      // Messages reçus
      g.onMessage((msg) => {
        setMessages(prev => [...prev, msg]);
        log('info', `Message from #${msg.contactIndex}: "${msg.text.substring(0, 30)}..."`);
      }),
      
      // Confirmations d'envoi
      g.onSendConfirmed((conf) => {
        handleSendConfirmed(conf);
      }),
      
      // Contacts
      g.onContact((contact) => {
        setMeshContacts(prev => {
          const existing = prev.findIndex(c => c.pubkeyHex === contact.pubkeyHex);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = contact;
            return next;
          }
          return [...prev, contact];
        });
      }),
      
      // Adverts
      g.onAdvert((advert) => {
        setAdverts(prev => {
          // Éviter doublons
          const existing = prev.findIndex(
            a => bufferToHex(a.publicKey) === bufferToHex(advert.publicKey)
          );
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = advert;
            return next;
          }
          return [...prev, advert];
        });
      }),
      
      // Path updates
      g.onPathUpdated((update) => {
        log('info', `Path updated for contact #${update.contactIndex}: ${update.path.length} hops`);
      }),
      
      // Logs
      g.onLog((event) => {
        setLogs(prev => [...prev.slice(-100), event]);  // Garder 100 derniers
      }),
      
      // Erreurs
      g.onError((err) => {
        setError(err.message);
      }),
      
      // Connexion
      g.onConnectionChange((isConnected) => {
        setConnected(isConnected);
        if (isConnected) {
          // Sync automatique des contacts
          syncContacts();
        }
      }),
    ];
    
    return () => {
      unsubs.forEach(u => u());
    };
  }, []);
  
  // -------------------------------------------------------------------------
  // GESTION APP STATE (background/foreground)
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App revient au foreground
        if (connected) {
          // Sync les messages en attente
          syncOfflineMessages();
        }
      }
      
      appStateRef.current = nextAppState;
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [connected]);
  
  // -------------------------------------------------------------------------
  // FONCTIONS UTILITAIRES
  // -------------------------------------------------------------------------
  
  const log = useCallback((level: MeshLogEvent['level'], message: string, data?: any) => {
    const event: MeshLogEvent = {
      timestamp: Date.now(),
      level,
      source: 'BleProvider',
      message,
      data,
    };
    
    if (__DEV__) {
      console.log(`[BleProvider] ${level}:`, message, data || '');
    }
    
    setLogs(prev => [...prev.slice(-100), event]);
  }, []);
  
  const handleSendConfirmed = useCallback((conf: SendConfirmation) => {
    setPendingMessages(prev => {
      const next = new Map(prev.map(m => [m.id, m]));
      
      // Trouver le message correspondant (par timestamp récent)
      const recent = Array.from(next.values())
        .filter(m => m.status === 'sent' && !m.ackCode)
        .sort((a, b) => b.sentAt - a.sentAt)[0];
      
      if (recent) {
        next.set(recent.id, {
          ...recent,
          status: 'confirmed',
          ackCode: conf.ackCode,
          rtt: conf.roundTripMs,
        });
      }
      
      return Array.from(next.values());
    });
    
    log('info', `Message confirmed: ACK=${conf.ackCode}, RTT=${conf.roundTripMs}ms`);
  }, [log]);
  
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (lastDeviceIdRef.current && !connected && !connecting) {
        log('info', 'Attempting reconnect...');
        connectToDevice(lastDeviceIdRef.current).catch(() => {
          // Replanifier si échec
          scheduleReconnect();
        });
      }
    }, 5000);
  }, [connected, connecting]);
  
  // -------------------------------------------------------------------------
  // ACTIONS BLE
  // -------------------------------------------------------------------------
  
  const scanForDevices = useCallback(async (duration = 5000): Promise<BleDevice[]> => {
    setScanning(true);
    setError(null);
    
    try {
      await BleManager.scan({
        serviceUUIDs: [BLE_SERVICE_UUID],
        seconds: duration / 1000,
        allowDuplicates: false,
      } as any);
      
      await new Promise(r => setTimeout(r, duration));
      
      const peripherals = await BleManager.getDiscoveredPeripherals();
      
      const devices: BleDevice[] = peripherals
        .filter(p => p.name && p.name.toLowerCase().includes('mesh'))
        .map(p => ({
          id: p.id,
          name: p.name || 'Unknown',
          rssi: p.rssi || -100,
        }));
      
      log('info', `Scan complete: ${devices.length} devices found`);
      return devices;
      
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setScanning(false);
    }
  }, [log]);
  
  const connectToDevice = useCallback(async (deviceId: string, name?: string) => {
    if (connecting || connected) return;
    
    setConnecting(true);
    setError(null);
    
    try {
      const info = await gatewayRef.current.connect(deviceId, name);
      
      setDevice({ id: deviceId, name: name || info.name || 'MeshCore', rssi: 0 });
      lastDeviceIdRef.current = deviceId;
      
      // Sauvegarder pour reconnexion
      await AsyncStorage.setItem('lastMeshDevice', deviceId);
      
      log('info', `Connected to ${info.name || deviceId}`);
      
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [connecting, connected, log]);
  
  const disconnect = useCallback(async () => {
    try {
      await gatewayRef.current.disconnect();
      setConnected(false);
      setDevice(null);
      setDeviceInfo(null);
      setMeshContacts([]);
      
      lastDeviceIdRef.current = null;
      await AsyncStorage.removeItem('lastMeshDevice');
      
      log('info', 'Disconnected');
    } catch (err: any) {
      log('error', 'Disconnect error', err.message);
    }
  }, [log]);
  
  // -------------------------------------------------------------------------
  // GESTION CONTACTS
  // -------------------------------------------------------------------------
  
  const syncContacts = useCallback(async () => {
    if (!connected) {
      setError('Non connecté');
      return;
    }
    
    setSyncingContacts(true);
    
    try {
      const contacts = await gatewayRef.current.getContacts(0);
      setMeshContacts(contacts);
      
      // Sauvegarder localement
      await AsyncStorage.setItem('meshContacts', JSON.stringify(contacts));
      
      log('info', `${contacts.length} contacts synchronized`);
    } catch (err: any) {
      setError(err.message);
      log('error', 'Sync contacts failed', err.message);
    } finally {
      setSyncingContacts(false);
    }
  }, [connected, log]);
  
  const addContact = useCallback(async (pubkeyHex: string, name?: string) => {
    if (!connected) {
      setError('Non connecté');
      return;
    }
    
    try {
      const displayName = name || generateNodeId(pubkeyHex);
      await gatewayRef.current.addContactFromScan(pubkeyHex, displayName);
      
      log('info', `Contact added: ${displayName}`);
      
      // Resync pour obtenir l'index
      await syncContacts();
      
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [connected, syncContacts, log]);
  
  const getContactByPubkey = useCallback((pubkeyHex: string): MeshContact | undefined => {
    return gatewayRef.current.getContactByPubkey(pubkeyHex);
  }, []);
  
  // -------------------------------------------------------------------------
  // ENVOI MESSAGES
  // -------------------------------------------------------------------------
  
  const sendDirectMessage = useCallback(async (pubkeyHex: string, text: string) => {
    if (!connected) throw new Error('Non connecté');
    
    const validation = validateMessage(text);
    if (validation) throw new Error(validation);
    
    const contact = gatewayRef.current.getContactByPubkey(pubkeyHex);
    if (!contact) {
      throw new Error('Contact non trouvé. Synchronisez les contacts d\'abord.');
    }
    
    if (contact.firmwareIndex < 0) {
      throw new Error('Contact non synchronisé avec le firmware. Ajoutez-le d\'abord.');
    }
    
    const id = `msg-${++messageIdRef.current}`;
    
    // Ajouter à la liste des pending
    const pending: PendingMessage = {
      id,
      contactIndex: contact.firmwareIndex,
      text,
      sentAt: Date.now(),
      status: 'sending',
      attempts: 1,
    };
    
    setPendingMessages(prev => [...prev, pending]);
    
    try {
      await gatewayRef.current.sendDirectMessage(contact.firmwareIndex, text);
      
      // Marquer comme envoyé au firmware
      setPendingMessages(prev =>
        prev.map(m => m.id === id ? { ...m, status: 'sent' } : m)
      );
      
      log('info', `Message sent to ${contact.name}`);
      
    } catch (err: any) {
      setPendingMessages(prev =>
        prev.map(m => m.id === id ? { ...m, status: 'failed', error: err.message } : m)
      );
      throw err;
    }
  }, [connected]);
  
  const sendChannelMessage = useCallback(async (channelIndex: number, text: string) => {
    if (!connected) throw new Error('Non connecté');
    
    const validation = validateMessage(text);
    if (validation) throw new Error(validation);
    
    const id = `msg-${++messageIdRef.current}`;
    
    const pending: PendingMessage = {
      id,
      channelIndex,
      text,
      sentAt: Date.now(),
      status: 'sending',
      attempts: 1,
    };
    
    setPendingMessages(prev => [...prev, pending]);
    
    try {
      await gatewayRef.current.sendChannelMessage(channelIndex, text);
      
      setPendingMessages(prev =>
        prev.map(m => m.id === id ? { ...m, status: 'sent' } : m)
      );
      
      log('info', `Channel message sent to #${channelIndex}`);
      
    } catch (err: any) {
      setPendingMessages(prev =>
        prev.map(m => m.id === id ? { ...m, status: 'failed', error: err.message } : m)
      );
      throw err;
    }
  }, [connected]);
  
  const sendFloodMessage = useCallback(async (text: string) => {
    return sendChannelMessage(0, text);
  }, [sendChannelMessage]);
  
  const syncOfflineMessages = useCallback(async () => {
    if (!connected) return;
    
    try {
      const msgs = await gatewayRef.current.syncAllOfflineMessages();
      if (msgs.length > 0) {
        setMessages(prev => [...prev, ...msgs]);
        log('info', `${msgs.length} offline messages received`);
      }
    } catch (err: any) {
      log('error', 'Sync offline messages failed', err.message);
    }
  }, [connected, log]);
  
  // -------------------------------------------------------------------------
  // CANAUX
  // -------------------------------------------------------------------------
  
  const getChannelInfo = useCallback(async (index: number) => {
    if (!connected) throw new Error('Non connecté');
    return gatewayRef.current.getChannelInfo(index);
  }, [connected]);
  
  // -------------------------------------------------------------------------
  // UTILITAIRES
  // -------------------------------------------------------------------------
  
  const clearError = useCallback(() => setError(null), []);
  
  const clearLogs = useCallback(() => setLogs([]), []);
  
  const getStats = useCallback(() => {
    return {
      ...gatewayRef.current.getStats(),
      pendingMessages: pendingMessages.length,
      storedMessages: messages.length,
      storedContacts: meshContacts.length,
    };
  }, [pendingMessages, messages, meshContacts]);
  
  // -------------------------------------------------------------------------
  // RENDU
  // -------------------------------------------------------------------------
  
  const value: BleContextValue = {
    connected,
    connecting,
    device,
    deviceInfo,
    error,
    meshContacts,
    messages,
    pendingMessages,
    adverts,
    logs,
    syncingContacts,
    scanning,
    scanForDevices,
    connectToDevice,
    disconnect,
    syncContacts,
    addContact,
    getContactByPubkey,
    sendDirectMessage,
    sendChannelMessage,
    sendFloodMessage,
    getChannelInfo,
    clearError,
    clearLogs,
    getStats,
  };
  
  return (
    <BleContext.Provider value={value}>
      {children}
    </BleContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useBle(): BleContextValue {
  const context = useContext(BleContext);
  if (!context) {
    throw new Error('useBle must be used within BleProviderComplete');
  }
  return context;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function validateMessage(text: string): string | null {
  if (!text || text.length === 0) {
    return 'Message vide';
  }
  if (text.length > LIMITS.MAX_MESSAGE_LENGTH) {
    return `Message trop long (${text.length}/${LIMITS.MAX_MESSAGE_LENGTH} caractères)`;
  }
  return null;
}

// Constante BLE
const BLE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';

export default BleProviderComplete;
