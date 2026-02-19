import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import {
  type GatewayState,
  type GatewayMode,
  type GatewayServiceType,
  type GatewayRelayJob,
  type GatewayPeer,
  type GatewayStats,
  createInitialGatewayState,
  activateGateway,
  deactivateGateway,
  broadcastTransaction,
  relayCashuToken,
  handleIncomingLoRaMessage,
  forwardPaymentToGateway,
  addGatewayPeer,
  cleanupStalePeers,
  cleanupOldJobs,
  getGatewayUptime,
  prepareLoRaChunks,
} from '@/utils/gateway';
import { testMqttConnection, type MqttBrokerConfig, DEFAULT_MQTT_CONFIG } from '@/utils/mqtt';

const GATEWAY_SETTINGS_KEY = 'meshcore_gateway_settings';

export interface GatewaySettings {
  mode: GatewayMode;
  autoActivate: boolean;
  services: Record<GatewayServiceType, boolean>;
  mqttBrokerUrl: string;
  mqttCustomBroker: string;
  useCustomMqttBroker: boolean;
  mempoolUrl: string;
  cashuMintUrl: string;
  cleanupIntervalMs: number;
  maxRelayJobAge: number;
  maxPeerAge: number;
}

const DEFAULT_GATEWAY_SETTINGS: GatewaySettings = {
  mode: 'client',
  autoActivate: false,
  services: {
    mempool: true,
    cashu: true,
    mqtt: true,
    lora: true,
  },
  mqttBrokerUrl: DEFAULT_MQTT_CONFIG.url,
  mqttCustomBroker: '',
  useCustomMqttBroker: false,
  mempoolUrl: 'https://mempool.space',
  cashuMintUrl: 'https://8333.space:3338', // ✅ TESTÉ ET FONCTIONNEL
  cleanupIntervalMs: 60000,
  maxRelayJobAge: 3600000,
  maxPeerAge: 300000,
};

export const [GatewayContext, useGateway] = createContextHook(() => {
  const [gatewayState, setGatewayState] = useState<GatewayState>(createInitialGatewayState());
  const [settings, setSettings] = useState<GatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSettingsQuery = useQuery({
    queryKey: ['gateway-settings'],
    queryFn: async () => {
      console.log('[GatewayProvider] Loading gateway settings...');
      try {
        const stored = await AsyncStorage.getItem(GATEWAY_SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<GatewaySettings>;
          console.log('[GatewayProvider] Loaded stored gateway settings');
          return { ...DEFAULT_GATEWAY_SETTINGS, ...parsed };
        }
        console.log('[GatewayProvider] No stored gateway settings, using defaults');
        return DEFAULT_GATEWAY_SETTINGS;
      } catch (err) {
        console.log('[GatewayProvider] Error loading gateway settings:', err);
        return DEFAULT_GATEWAY_SETTINGS;
      }
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (loadSettingsQuery.data) {
      setSettings(loadSettingsQuery.data);
    }
  }, [loadSettingsQuery.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: GatewaySettings) => {
      console.log('[GatewayProvider] Saving gateway settings...');
      await AsyncStorage.setItem(GATEWAY_SETTINGS_KEY, JSON.stringify(newSettings));
      return newSettings;
    },
    onSuccess: (saved) => {
      setSettings(saved);
      console.log('[GatewayProvider] Gateway settings saved');
    },
    onError: (err) => {
      console.log('[GatewayProvider] Error saving gateway settings:', err);
    },
  });

  const updateSettings = useCallback((partial: Partial<GatewaySettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    saveSettingsMutation.mutate(updated);
  }, [settings, saveSettingsMutation]);

  const activateMutation = useMutation({
    mutationFn: async () => {
      console.log('[GatewayProvider] Activating gateway...');
      const mqttConfig: Partial<MqttBrokerConfig> = {
        url: settings.useCustomMqttBroker && settings.mqttCustomBroker.trim()
          ? settings.mqttCustomBroker.trim()
          : settings.mqttBrokerUrl,
      };
      const newState = await activateGateway(
        {
          ...gatewayState,
          services: settings.services,
          mempoolUrl: settings.mempoolUrl,
          cashuMintUrl: settings.cashuMintUrl,
        },
        mqttConfig
      );
      return newState;
    },
    onSuccess: (newState) => {
      setGatewayState(newState);
      updateSettings({ mode: 'gateway' });
      console.log('[GatewayProvider] Gateway activated successfully');
    },
    onError: (err) => {
      console.log('[GatewayProvider] Gateway activation failed:', err);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      console.log('[GatewayProvider] Deactivating gateway...');
      return deactivateGateway(gatewayState);
    },
    onSuccess: (newState) => {
      setGatewayState(newState);
      updateSettings({ mode: 'client' });
      console.log('[GatewayProvider] Gateway deactivated');
    },
  });

  const broadcastTxMutation = useMutation({
    mutationFn: async ({ txHex, sourceNodeId }: { txHex: string; sourceNodeId: string }) => {
      return broadcastTransaction(gatewayState, txHex, sourceNodeId);
    },
    onSuccess: ({ state: newState }) => {
      setGatewayState(newState);
    },
  });

  const relayCashuMutation = useMutation({
    mutationFn: async ({
      token,
      mintUrl,
      sourceNodeId,
      action,
    }: {
      token: string;
      mintUrl: string;
      sourceNodeId: string;
      action: 'relay' | 'redeem' | 'mint';
    }) => {
      return relayCashuToken(gatewayState, token, mintUrl, sourceNodeId, action);
    },
    onSuccess: ({ state: newState }) => {
      setGatewayState(newState);
    },
  });

  const handleLoRaMessage = useCallback((rawMessage: string, sourceNodeId: string) => {
    if (gatewayState.mode !== 'gateway' || !gatewayState.isActive) {
      console.log('[GatewayProvider] Not in gateway mode, ignoring LoRa message');
      return;
    }
    const newState = handleIncomingLoRaMessage(gatewayState, rawMessage, sourceNodeId);
    setGatewayState(newState);
  }, [gatewayState]);

  const forwardPayment = useCallback(async (
    paymentData: string,
    paymentType: 'BTC_TX' | 'CASHU' | 'LN_INV',
    destinationNodeId: string
  ) => {
    const newState = await forwardPaymentToGateway(
      gatewayState,
      paymentData,
      paymentType,
      destinationNodeId
    );
    setGatewayState(newState);
  }, [gatewayState]);

  const registerPeer = useCallback((peer: GatewayPeer) => {
    const newState = addGatewayPeer(gatewayState, peer);
    setGatewayState(newState);
  }, [gatewayState]);

  const toggleService = useCallback((service: GatewayServiceType, enabled: boolean) => {
    const updatedServices = { ...settings.services, [service]: enabled };
    updateSettings({ services: updatedServices });
    setGatewayState((prev) => ({
      ...prev,
      services: updatedServices,
    }));
  }, [settings, updateSettings]);

  useEffect(() => {
    if (gatewayState.isActive) {
      cleanupTimerRef.current = setInterval(() => {
        setGatewayState((prev) => {
          let s = cleanupStalePeers(prev, settings.maxPeerAge);
          s = cleanupOldJobs(s, settings.maxRelayJobAge);
          return s;
        });
      }, settings.cleanupIntervalMs);
    }

    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [gatewayState.isActive, settings.cleanupIntervalMs, settings.maxPeerAge, settings.maxRelayJobAge]);

  const getMqttBrokerUrl = useCallback((): string => {
    if (settings.useCustomMqttBroker && settings.mqttCustomBroker.trim()) {
      return settings.mqttCustomBroker.trim();
    }
    return settings.mqttBrokerUrl;
  }, [settings]);

  const getUptime = useCallback((): string => {
    return getGatewayUptime(gatewayState);
  }, [gatewayState]);

  return {
    gatewayState,
    settings,
    updateSettings,
    activateGateway: () => activateMutation.mutate(),
    deactivateGateway: () => deactivateMutation.mutate(),
    broadcastTx: (txHex: string, sourceNodeId: string) =>
      broadcastTxMutation.mutate({ txHex, sourceNodeId }),
    relayCashu: (token: string, mintUrl: string, sourceNodeId: string, action: 'relay' | 'redeem' | 'mint') =>
      relayCashuMutation.mutate({ token, mintUrl, sourceNodeId, action }),
    handleLoRaMessage,
    forwardPayment,
    registerPeer,
    toggleService,
    getMqttBrokerUrl,
    getUptime,
    isActivating: activateMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
    isBroadcasting: broadcastTxMutation.isPending,
    isRelaying: relayCashuMutation.isPending,
    isLoading: loadSettingsQuery.isLoading,
  };
});
