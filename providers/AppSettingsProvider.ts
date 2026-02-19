import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';

const SETTINGS_KEY = 'meshcore_app_settings';

export type ConnectionMode = 'internet' | 'lora' | 'bridge';

export interface AppSettings {
  connectionMode: ConnectionMode;
  mempoolUrl: string;
  customMempoolUrl: string;
  useCustomMempool: boolean;
  defaultCashuMint: string;
  fallbackCashuMint: string;
  customCashuMint: string;
  useCustomCashuMint: boolean;
  bitcoinNetwork: 'mainnet' | 'testnet';
  fiatCurrency: string;
  autoSyncInterval: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  connectionMode: 'internet',
  mempoolUrl: 'https://mempool.space',
  customMempoolUrl: '',
  useCustomMempool: false,
  defaultCashuMint: 'https://8333.space:3338', // ✅ TESTÉ ET FONCTIONNEL
  fallbackCashuMint: 'https://mint.lnvoltz.com', // ✅ BACKUP TESTÉ ET FONCTIONNEL
  customCashuMint: '',
  useCustomCashuMint: false,
  bitcoinNetwork: 'mainnet',
  fiatCurrency: 'EUR',
  autoSyncInterval: 30000,
};

export const [AppSettingsContext, useAppSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const loadQuery = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      console.log('[AppSettings] Loading settings...');
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppSettings>;
          console.log('[AppSettings] Loaded stored settings');
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
        console.log('[AppSettings] No stored settings, using defaults');
        return DEFAULT_SETTINGS;
      } catch (err) {
        console.log('[AppSettings] Error loading settings:', err);
        return DEFAULT_SETTINGS;
      }
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (loadQuery.data) {
      setSettings(loadQuery.data);
    }
  }, [loadQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: AppSettings) => {
      console.log('[AppSettings] Saving settings...');
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      return newSettings;
    },
    onSuccess: (saved) => {
      setSettings(saved);
      console.log('[AppSettings] Settings saved successfully');
    },
    onError: (err) => {
      console.log('[AppSettings] Error saving settings:', err);
    },
  });

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    saveMutation.mutate(updated);
  }, [settings, saveMutation]);

  const getMempoolUrl = useCallback((): string => {
    if (settings.useCustomMempool && settings.customMempoolUrl.trim()) {
      return settings.customMempoolUrl.trim().replace(/\/$/, '');
    }
    return settings.mempoolUrl;
  }, [settings]);

  const getCashuMintUrl = useCallback((): string => {
    if (settings.useCustomCashuMint && settings.customCashuMint.trim()) {
      return settings.customCashuMint.trim().replace(/\/$/, '');
    }
    return settings.defaultCashuMint;
  }, [settings]);

  const resetToDefaults = useCallback(() => {
    saveMutation.mutate(DEFAULT_SETTINGS);
  }, [saveMutation]);

  const isInternetMode = settings.connectionMode === 'internet' || settings.connectionMode === 'bridge';
  const isLoRaMode = settings.connectionMode === 'lora' || settings.connectionMode === 'bridge';
  const isBridgeMode = settings.connectionMode === 'bridge';

  return {
    settings,
    updateSettings,
    getMempoolUrl,
    getCashuMintUrl,
    resetToDefaults,
    isInternetMode,
    isLoRaMode,
    isBridgeMode,
    isLoading: loadQuery.isLoading,
    isSaving: saveMutation.isPending,
  };
});
