import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Animated,
  ActivityIndicator,
} from 'react-native';
import {
  Radio,
  Shield,
  Key,
  Bell,
  HardDrive,
  Info,
  ChevronRight,
  Bluetooth,
  Cpu,
  Eye,
  EyeOff,
  Trash2,
  Download,
  Plus,
  Copy,
  Check,
  Fingerprint,
  Globe,
  Server,
  Landmark,
  RefreshCw,
  ExternalLink,
  CircleCheck,
  CircleX,
  QrCode,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Colors from '@/constants/colors';
import { useWalletSeed } from '@/providers/WalletSeedProvider';
import { useBitcoin } from '@/providers/BitcoinProvider';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import SeedQRScanner from '@/components/SeedQRScanner';
import { useGateway } from '@/providers/GatewayProvider';
import { type ConnectionMode } from '@/providers/AppSettingsProvider';
import { testMempoolConnection } from '@/utils/mempool';
import { UpdateChecker } from '@/components/UpdateChecker';
import { testMintConnection, formatMintUrl } from '@/utils/cashu';
import { testMqttConnection } from '@/utils/mqtt';
import { mockGatewayRelayLog, mockGatewayStats, type GatewayRelayLogEntry } from '@/mocks/data';

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  hasChevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
}

function SettingRow({ icon, label, value, hasChevron = true, onPress, destructive }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.settingLeft}>
        {icon}
        <Text style={[styles.settingLabel, destructive && styles.settingLabelDestructive]}>{label}</Text>
      </View>
      <View style={styles.settingRight}>
        {value && <Text style={styles.settingValue} numberOfLines={1}>{value}</Text>}
        {hasChevron && <ChevronRight size={16} color={Colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

interface SettingToggleProps {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}

function SettingToggle({ icon, label, value, onToggle }: SettingToggleProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        {icon}
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.surfaceHighlight, true: Colors.accentDim }}
        thumbColor={value ? Colors.accent : Colors.textMuted}
      />
    </View>
  );
}

function SeedWordChip({ word, index }: { word: string; index: number }) {
  return (
    <View style={styles.seedWordChip}>
      <Text style={styles.seedWordIndex}>{index + 1}</Text>
      <Text style={styles.seedWordText}>{word}</Text>
    </View>
  );
}

function SeedManagementCard() {
  const {
    mnemonic,
    walletInfo,
    isInitialized,
    isLoading,
    isGenerating,
    isImporting,
    generateError,
    importError,
    generateNewWallet,
    importWallet,
    deleteWallet,
    getFormattedAddress,
  } = useWalletSeed();

  const [showSeed, setShowSeed] = useState<boolean>(false);
  const [showImport, setShowImport] = useState<boolean>(false);
  const [showSeedQRScanner, setShowSeedQRScanner] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  // Afficher les erreurs de génération/import
  useEffect(() => {
    if (generateError) {
      Alert.alert(
        'Erreur Génération Wallet',
        `Impossible de générer le wallet:\n${generateError.message}\n\nVérifiez les logs pour plus de détails.`,
        [{ text: 'OK', onPress: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) }]
      );
    }
  }, [generateError]);

  useEffect(() => {
    if (importError) {
      Alert.alert(
        'Erreur Import Wallet',
        `Impossible d'importer le wallet:\n${importError.message}`,
        [{ text: 'OK', onPress: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) }]
      );
    }
  }, [importError]);

  const handleGenerate = useCallback((strength: 12 | 24 = 12) => {
    if (isInitialized) {
      Alert.alert(
        'Replace Wallet?',
        'This will generate a new seed and replace your current wallet. Make sure you have backed up your current seed phrase!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              generateNewWallet(strength);
            },
          },
        ]
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      generateNewWallet(strength);
    }
  }, [isInitialized, generateNewWallet]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) {
      Alert.alert('Error', 'Please enter your seed phrase');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    importWallet(importText);
    setShowImport(false);
    setImportText('');
  }, [importText, importWallet]);

  const handleSeedQRScanned = useCallback((mnemonic: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    importWallet(mnemonic);
    setShowSeedQRScanner(false);
    Alert.alert('Succès', 'Seed importée depuis SeedQR');
  }, [importWallet]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Wallet',
      'This will permanently delete your wallet seed from this device. Make sure you have a backup!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            deleteWallet();
            setShowSeed(false);
          },
        },
      ]
    );
  }, [deleteWallet]);

  const handleCopyAddress = useCallback(() => {
    if (walletInfo?.firstReceiveAddress) {
      Clipboard.setStringAsync(walletInfo.firstReceiveAddress).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [walletInfo]);

  const handleToggleSeed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSeed(prev => !prev);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.seedCard}>
        <View style={styles.seedLoadingContainer}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.seedLoadingText}>Loading wallet...</Text>
        </View>
      </View>
    );
  }

  const words = mnemonic ? mnemonic.split(' ') : [];

  return (
    <Animated.View style={[styles.seedCard, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.seedCardHeader}>
        <View style={styles.seedCardTitleRow}>
          <Fingerprint size={18} color={Colors.accent} />
          <Text style={styles.seedCardTitle}>Wallet Seed</Text>
        </View>
        <View style={[
          styles.seedStatusBadge,
          isInitialized ? styles.seedStatusActive : styles.seedStatusInactive,
        ]}>
          <Text style={[
            styles.seedStatusText,
            isInitialized ? styles.seedStatusTextActive : styles.seedStatusTextInactive,
          ]}>
            {isInitialized ? 'ACTIVE' : 'NO SEED'}
          </Text>
        </View>
      </View>

      {isInitialized && walletInfo ? (
        <>
          <View style={styles.walletInfoRow}>
            <Text style={styles.walletInfoLabel}>Address</Text>
            <TouchableOpacity
              style={styles.addressCopyRow}
              onPress={handleCopyAddress}
              activeOpacity={0.7}
            >
              <Text style={styles.walletInfoValue}>{getFormattedAddress()}</Text>
              {copied ? (
                <Check size={14} color={Colors.green} />
              ) : (
                <Copy size={14} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.walletInfoRow}>
            <Text style={styles.walletInfoLabel}>Fingerprint</Text>
            <Text style={styles.walletInfoValue}>{walletInfo.fingerprint}</Text>
          </View>
          <View style={styles.walletInfoRow}>
            <Text style={styles.walletInfoLabel}>Type</Text>
            <Text style={styles.walletInfoValue}>BIP84 Native SegWit</Text>
          </View>
          <View style={styles.walletInfoRow}>
            <Text style={styles.walletInfoLabel}>Words</Text>
            <Text style={styles.walletInfoValue}>{words.length} words</Text>
          </View>

          <TouchableOpacity
            style={styles.showSeedButton}
            onPress={handleToggleSeed}
            activeOpacity={0.7}
          >
            {showSeed ? (
              <EyeOff size={16} color={Colors.accent} />
            ) : (
              <Eye size={16} color={Colors.accent} />
            )}
            <Text style={styles.showSeedText}>
              {showSeed ? 'Hide Seed Phrase' : 'Reveal Seed Phrase'}
            </Text>
          </TouchableOpacity>

          {showSeed && (
            <View style={styles.seedWordsContainer}>
              <View style={styles.seedWarningBanner}>
                <Shield size={14} color={Colors.yellow} />
                <Text style={styles.seedWarningText}>
                  Never share your seed phrase. Anyone with it can access your funds.
                </Text>
              </View>
              <View style={styles.seedWordsGrid}>
                {words.map((word, i) => (
                  <SeedWordChip key={`${i}-${word}`} word={word} index={i} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.seedActionsRow}>
            <TouchableOpacity
              style={styles.seedActionSmall}
              onPress={() => handleGenerate(12)}
              activeOpacity={0.7}
            >
              {isGenerating ? (
                <ActivityIndicator color={Colors.accent} size="small" />
              ) : (
                <>
                  <Plus size={14} color={Colors.accent} />
                  <Text style={styles.seedActionSmallText}>New 12w</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.seedActionSmall}
              onPress={() => handleGenerate(24)}
              activeOpacity={0.7}
            >
              <Plus size={14} color={Colors.accent} />
              <Text style={styles.seedActionSmallText}>New 24w</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.seedActionSmall, styles.seedActionDestructive]}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Trash2 size={14} color={Colors.red} />
              <Text style={styles.seedActionDestructiveText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.noSeedDesc}>
            Generate a new BIP39 seed phrase or import an existing one to create your Bitcoin wallet.
          </Text>

          <View style={styles.generateButtons}>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={() => handleGenerate(12)}
              activeOpacity={0.7}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <>
                  <Key size={18} color={Colors.black} />
                  <Text style={styles.generateButtonText}>Generate 12 Words</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.generateButton24}
              onPress={() => handleGenerate(24)}
              activeOpacity={0.7}
              disabled={isGenerating}
            >
              <Key size={18} color={Colors.accent} />
              <Text style={styles.generateButton24Text}>Generate 24 Words</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.importToggle}
            onPress={() => setShowImport(prev => !prev)}
            activeOpacity={0.7}
          >
            <Download size={16} color={Colors.textSecondary} />
            <Text style={styles.importToggleText}>
              {showImport ? 'Cancel Import' : 'Import Existing Seed'}
            </Text>
          </TouchableOpacity>

          {showImport && (
            <View style={styles.importContainer}>
              <TextInput
                style={styles.importInput}
                placeholder="Enter your 12 or 24 word seed phrase..."
                placeholderTextColor={Colors.textMuted}
                value={importText}
                onChangeText={setImportText}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                testID="import-seed-input"
              />
              
              {/* Bouton Scan SeedQR */}
              <TouchableOpacity
                style={styles.scanQRButton}
                onPress={() => setShowSeedQRScanner(true)}
                activeOpacity={0.7}
              >
                <QrCode size={18} color={Colors.background} />
                <Text style={styles.scanQRButtonText}>Scan SeedQR</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.importButton}
                onPress={handleImport}
                activeOpacity={0.7}
                disabled={isImporting}
              >
                {isImporting ? (
                  <ActivityIndicator color={Colors.black} size="small" />
                ) : (
                  <Text style={styles.importButtonText}>Import Wallet</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

function EndpointConfigCard() {
  const { settings, updateSettings, getMempoolUrl, getCashuMintUrl } = useAppSettings();
  const [mempoolInput, setMempoolInput] = useState<string>(settings.customMempoolUrl);
  const [cashuInput, setCashuInput] = useState<string>(settings.customCashuMint);
  const [testingMempool, setTestingMempool] = useState<boolean>(false);
  const [testingCashu, setTestingCashu] = useState<boolean>(false);
  const [mempoolStatus, setMempoolStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [cashuStatus, setCashuStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [cashuMintName, setCashuMintName] = useState<string>('');

  useEffect(() => {
    setMempoolInput(settings.customMempoolUrl);
    setCashuInput(settings.customCashuMint);
  }, [settings.customMempoolUrl, settings.customCashuMint]);

  const handleTestMempool = useCallback(async () => {
    const urlToTest = settings.useCustomMempool && mempoolInput.trim()
      ? mempoolInput.trim().replace(/\/$/, '')
      : settings.mempoolUrl;
    setTestingMempool(true);
    setMempoolStatus('idle');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const ok = await testMempoolConnection(urlToTest);
      setMempoolStatus(ok ? 'ok' : 'fail');
      Haptics.notificationAsync(
        ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {
      setMempoolStatus('fail');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTestingMempool(false);
    }
  }, [settings, mempoolInput]);

  const handleTestCashu = useCallback(async () => {
    const urlToTest = settings.useCustomCashuMint && cashuInput.trim()
      ? formatMintUrl(cashuInput.trim())
      : settings.defaultCashuMint;
    setTestingCashu(true);
    setCashuStatus('idle');
    setCashuMintName('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await testMintConnection(urlToTest);
      setCashuStatus(result.ok ? 'ok' : 'fail');
      if (result.ok && result.name) setCashuMintName(result.name);
      Haptics.notificationAsync(
        result.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {
      setCashuStatus('fail');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTestingCashu(false);
    }
  }, [settings, cashuInput]);

  const handleSaveMempoolCustom = useCallback(() => {
    updateSettings({ customMempoolUrl: mempoolInput.trim().replace(/\/$/, '') });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Saved', 'Custom Mempool URL saved');
  }, [mempoolInput, updateSettings]);

  const handleSaveCashuCustom = useCallback(() => {
    updateSettings({ customCashuMint: formatMintUrl(cashuInput.trim()) });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Saved', 'Custom Cashu Mint URL saved');
  }, [cashuInput, updateSettings]);

  return (
    <>
      <View style={styles.endpointCard}>
        <View style={styles.endpointHeader}>
          <Globe size={16} color={Colors.accent} />
          <Text style={styles.endpointTitle}>Mempool API</Text>
          {mempoolStatus === 'ok' && <CircleCheck size={14} color={Colors.green} />}
          {mempoolStatus === 'fail' && <CircleX size={14} color={Colors.red} />}
        </View>

        <View style={styles.endpointRow}>
          <Text style={styles.endpointLabel}>Default</Text>
          <Text style={styles.endpointUrl}>{settings.mempoolUrl}</Text>
        </View>

        <View style={styles.endpointRow}>
          <Text style={styles.endpointLabel}>Active</Text>
          <Text style={[styles.endpointUrl, styles.endpointUrlActive]}>{getMempoolUrl()}</Text>
        </View>

        <SettingToggle
          icon={<Server size={16} color={Colors.blue} />}
          label="Use Custom Endpoint"
          value={settings.useCustomMempool}
          onToggle={(val) => updateSettings({ useCustomMempool: val })}
        />

        {settings.useCustomMempool && (
          <View style={styles.customEndpointContainer}>
            <TextInput
              style={styles.endpointInput}
              placeholder="https://your-mempool-instance.com"
              placeholderTextColor={Colors.textMuted}
              value={mempoolInput}
              onChangeText={setMempoolInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="custom-mempool-input"
            />
            <TouchableOpacity
              style={styles.saveEndpointBtn}
              onPress={handleSaveMempoolCustom}
              activeOpacity={0.7}
            >
              <Check size={16} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.testButton}
          onPress={handleTestMempool}
          activeOpacity={0.7}
          disabled={testingMempool}
        >
          {testingMempool ? (
            <ActivityIndicator color={Colors.accent} size="small" />
          ) : (
            <>
              <RefreshCw size={14} color={Colors.accent} />
              <Text style={styles.testButtonText}>Test Connection</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.endpointCard}>
        <View style={styles.endpointHeader}>
          <Landmark size={16} color={Colors.cyan} />
          <Text style={styles.endpointTitle}>Cashu Mint</Text>
          {cashuStatus === 'ok' && <CircleCheck size={14} color={Colors.green} />}
          {cashuStatus === 'fail' && <CircleX size={14} color={Colors.red} />}
        </View>

        <View style={styles.endpointRow}>
          <Text style={styles.endpointLabel}>Default</Text>
          <Text style={styles.endpointUrl} numberOfLines={1}>{settings.defaultCashuMint}</Text>
        </View>

        <View style={styles.endpointRow}>
          <Text style={styles.endpointLabel}>Active</Text>
          <Text style={[styles.endpointUrl, styles.endpointUrlCashu]} numberOfLines={1}>{getCashuMintUrl()}</Text>
        </View>

        {cashuMintName !== '' && (
          <View style={styles.endpointRow}>
            <Text style={styles.endpointLabel}>Name</Text>
            <Text style={styles.endpointUrlCashu}>{cashuMintName}</Text>
          </View>
        )}

        <SettingToggle
          icon={<Server size={16} color={Colors.cyan} />}
          label="Use Custom Mint"
          value={settings.useCustomCashuMint}
          onToggle={(val) => updateSettings({ useCustomCashuMint: val })}
        />

        {settings.useCustomCashuMint && (
          <View style={styles.customEndpointContainer}>
            <TextInput
              style={styles.endpointInput}
              placeholder="https://your-mint.com"
              placeholderTextColor={Colors.textMuted}
              value={cashuInput}
              onChangeText={setCashuInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="custom-cashu-input"
            />
            <TouchableOpacity
              style={styles.saveEndpointBtn}
              onPress={handleSaveCashuCustom}
              activeOpacity={0.7}
            >
              <Check size={16} color={Colors.cyan} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.testButton, styles.testButtonCashu]}
          onPress={handleTestCashu}
          activeOpacity={0.7}
          disabled={testingCashu}
        >
          {testingCashu ? (
            <ActivityIndicator color={Colors.cyan} size="small" />
          ) : (
            <>
              <RefreshCw size={14} color={Colors.cyan} />
              <Text style={[styles.testButtonText, styles.testButtonTextCashu]}>Test Connection</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

function GatewayModeCard() {
  const {
    gatewayState,
    settings: gwSettings,
    updateSettings: updateGwSettings,
    activateGateway: activateGw,
    deactivateGateway: deactivateGw,
    toggleService,
    getMqttBrokerUrl,
    getUptime,
    isActivating,
    isDeactivating,
  } = useGateway();

  const [mqttInput, setMqttInput] = useState<string>(gwSettings.mqttCustomBroker);
  const [testingMqtt, setTestingMqtt] = useState<boolean>(false);
  const [mqttStatus, setMqttStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [showRelayLog, setShowRelayLog] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (gatewayState.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [gatewayState.isActive, pulseAnim]);

  useEffect(() => {
    setMqttInput(gwSettings.mqttCustomBroker);
  }, [gwSettings.mqttCustomBroker]);

  const handleToggleMode = useCallback(() => {
    if (gatewayState.isActive) {
      Alert.alert(
        'Deactivate Gateway',
        'This will stop relaying transactions and disconnect MQTT. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              deactivateGw();
            },
          },
        ]
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      activateGw();
    }
  }, [gatewayState.isActive, activateGw, deactivateGw]);

  const handleTestMqtt = useCallback(async () => {
    const url = getMqttBrokerUrl();
    setTestingMqtt(true);
    setMqttStatus('idle');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await testMqttConnection(url);
      setMqttStatus(result.ok ? 'ok' : 'fail');
      Haptics.notificationAsync(
        result.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    } catch {
      setMqttStatus('fail');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTestingMqtt(false);
    }
  }, [getMqttBrokerUrl]);

  const handleSaveMqttCustom = useCallback(() => {
    updateGwSettings({ mqttCustomBroker: mqttInput.trim() });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Saved', 'Custom MQTT broker URL saved');
  }, [mqttInput, updateGwSettings]);

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const statusColor = gatewayState.isActive ? Colors.green : Colors.textMuted;
  const stats = mockGatewayStats;

  return (
    <Animated.View style={[styles.gatewayCard, { opacity: fadeAnim }]}>
      <View style={styles.gatewayHeader}>
        <View style={styles.gatewayTitleRow}>
          <Server size={18} color={gatewayState.isActive ? Colors.green : Colors.purple} />
          <Text style={styles.gatewayTitle}>Gateway Mode</Text>
        </View>
        <View style={styles.gatewayStatusRow}>
          {gatewayState.isActive && (
            <Animated.View style={[styles.gatewayPulseDot, { opacity: pulseOpacity, backgroundColor: Colors.green }]} />
          )}
          <View style={[
            styles.gatewayModeBadge,
            gatewayState.isActive ? styles.gatewayModeBadgeActive : styles.gatewayModeBadgeInactive,
          ]}>
            <Text style={[
              styles.gatewayModeText,
              gatewayState.isActive ? styles.gatewayModeTextActive : styles.gatewayModeTextInactive,
            ]}>
              {gatewayState.isActive ? 'GATEWAY' : 'CLIENT'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.gatewayDesc}>
        {gatewayState.isActive
          ? 'Relaying BTC transactions, Cashu tokens, and chunked messages for mesh peers.'
          : 'Activate to relay LoRa messages to Mempool, Cashu mints, and MQTT brokers.'}
      </Text>

      <TouchableOpacity
        style={[
          styles.gatewayToggleBtn,
          gatewayState.isActive ? styles.gatewayToggleBtnActive : styles.gatewayToggleBtnInactive,
        ]}
        onPress={handleToggleMode}
        activeOpacity={0.7}
        disabled={isActivating || isDeactivating}
        testID="gateway-toggle-button"
      >
        {isActivating || isDeactivating ? (
          <ActivityIndicator color={gatewayState.isActive ? Colors.red : Colors.green} size="small" />
        ) : (
          <>
            <Server size={16} color={gatewayState.isActive ? Colors.red : Colors.green} />
            <Text style={[
              styles.gatewayToggleText,
              gatewayState.isActive ? styles.gatewayToggleTextDeactivate : styles.gatewayToggleTextActivate,
            ]}>
              {gatewayState.isActive ? 'Deactivate Gateway' : 'Activate Gateway'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {gatewayState.isActive && (
        <View style={styles.gatewayStatsGrid}>
          <View style={styles.gatewayStatItem}>
            <Text style={styles.gatewayStatValue}>{stats.txRelayed}</Text>
            <Text style={styles.gatewayStatLabel}>TX Relayed</Text>
          </View>
          <View style={styles.gatewayStatItem}>
            <Text style={[styles.gatewayStatValue, { color: Colors.cyan }]}>{stats.cashuRelayed}</Text>
            <Text style={styles.gatewayStatLabel}>Cashu</Text>
          </View>
          <View style={styles.gatewayStatItem}>
            <Text style={styles.gatewayStatValue}>{stats.chunksProcessed}</Text>
            <Text style={styles.gatewayStatLabel}>Chunks</Text>
          </View>
          <View style={styles.gatewayStatItem}>
            <Text style={[styles.gatewayStatValue, { color: Colors.green }]}>{stats.peersServed}</Text>
            <Text style={styles.gatewayStatLabel}>Peers</Text>
          </View>
        </View>
      )}

      <View style={styles.gatewayServicesSection}>
        <Text style={styles.gatewayServicesTitle}>Relay Services</Text>
        <SettingToggle
          icon={<Globe size={16} color={Colors.accent} />}
          label="Mempool Broadcast"
          value={gwSettings.services.mempool}
          onToggle={(val) => toggleService('mempool', val)}
        />
        <SettingToggle
          icon={<Landmark size={16} color={Colors.cyan} />}
          label="Cashu Relay"
          value={gwSettings.services.cashu}
          onToggle={(val) => toggleService('cashu', val)}
        />
        <SettingToggle
          icon={<Server size={16} color={Colors.purple} />}
          label="MQTT Bridge"
          value={gwSettings.services.mqtt}
          onToggle={(val) => toggleService('mqtt', val)}
        />
        <SettingToggle
          icon={<Radio size={16} color={Colors.green} />}
          label="LoRa Forwarding"
          value={gwSettings.services.lora}
          onToggle={(val) => toggleService('lora', val)}
        />
      </View>

      {gwSettings.services.mqtt && (
        <View style={styles.mqttSection}>
          <View style={styles.mqttHeader}>
            <Server size={14} color={Colors.purple} />
            <Text style={styles.mqttTitle}>MQTT Broker</Text>
            {mqttStatus === 'ok' && <CircleCheck size={14} color={Colors.green} />}
            {mqttStatus === 'fail' && <CircleX size={14} color={Colors.red} />}
          </View>

          <View style={styles.endpointRow}>
            <Text style={styles.endpointLabel}>Active</Text>
            <Text style={[styles.endpointUrl, { color: Colors.purple }]} numberOfLines={1}>
              {getMqttBrokerUrl()}
            </Text>
          </View>

          <SettingToggle
            icon={<Server size={14} color={Colors.purple} />}
            label="Custom Broker"
            value={gwSettings.useCustomMqttBroker}
            onToggle={(val) => updateGwSettings({ useCustomMqttBroker: val })}
          />

          {gwSettings.useCustomMqttBroker && (
            <View style={styles.customEndpointContainer}>
              <TextInput
                style={styles.endpointInput}
                placeholder="wss://your-broker.com:8084/mqtt"
                placeholderTextColor={Colors.textMuted}
                value={mqttInput}
                onChangeText={setMqttInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                testID="custom-mqtt-input"
              />
              <TouchableOpacity
                style={styles.saveEndpointBtn}
                onPress={handleSaveMqttCustom}
                activeOpacity={0.7}
              >
                <Check size={16} color={Colors.purple} />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.mqttTestButton}
            onPress={handleTestMqtt}
            activeOpacity={0.7}
            disabled={testingMqtt}
          >
            {testingMqtt ? (
              <ActivityIndicator color={Colors.purple} size="small" />
            ) : (
              <>
                <RefreshCw size={14} color={Colors.purple} />
                <Text style={styles.mqttTestButtonText}>Test Connection</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.relayLogToggle}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowRelayLog((prev) => !prev);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.relayLogToggleText}>
          {showRelayLog ? 'Hide Relay Log' : 'Show Relay Log'}
        </Text>
      </TouchableOpacity>

      {showRelayLog && (
        <View style={styles.relayLogContainer}>
          {mockGatewayRelayLog.map((entry) => (
            <RelayLogItem key={entry.id} entry={entry} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

function RelayLogItem({ entry }: { entry: GatewayRelayLogEntry }) {
  const typeColorMap: Record<string, string> = {
    tx_broadcast: Colors.accent,
    cashu_relay: Colors.cyan,
    cashu_redeem: Colors.cyan,
    chunk_reassembly: Colors.blue,
    payment_forward: Colors.purple,
  };
  const color = typeColorMap[entry.type] ?? Colors.textMuted;
  const statusIcon = entry.status === 'completed'
    ? <CircleCheck size={12} color={Colors.green} />
    : entry.status === 'failed'
    ? <CircleX size={12} color={Colors.red} />
    : <RefreshCw size={12} color={Colors.yellow} />;
  const elapsed = Date.now() - entry.timestamp;
  const minutes = Math.floor(elapsed / 60000);
  const timeLabel = minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;

  return (
    <View style={styles.relayLogItem}>
      <View style={[styles.relayLogDot, { backgroundColor: color }]} />
      <View style={styles.relayLogContent}>
        <View style={styles.relayLogTop}>
          <Text style={[styles.relayLogType, { color }]}>
            {entry.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
          {statusIcon}
          <Text style={styles.relayLogTime}>{timeLabel}</Text>
        </View>
        <Text style={styles.relayLogDetail} numberOfLines={2}>{entry.detail}</Text>
        <Text style={styles.relayLogMeta}>
          From: {entry.sourceNodeId} · {entry.bytesRelayed}B
        </Text>
      </View>
    </View>
  );
}

function ConnectionModeSelector() {
  const { settings, updateSettings } = useAppSettings();

  const modes: { key: ConnectionMode; label: string; desc: string; color: string; icon: React.ReactNode }[] = [
    {
      key: 'internet',
      label: 'Internet',
      desc: 'No LoRa needed. Route via MQTT gateways.',
      color: Colors.blue,
      icon: <Globe size={18} color={Colors.blue} />,
    },
    {
      key: 'lora',
      label: 'LoRa Mesh',
      desc: 'Direct LoRa radio. Fully off-grid.',
      color: Colors.green,
      icon: <Radio size={18} color={Colors.green} />,
    },
    {
      key: 'bridge',
      label: 'Bridge',
      desc: 'Both LoRa and Internet for max reach.',
      color: Colors.cyan,
      icon: <Server size={18} color={Colors.cyan} />,
    },
  ];

  const handleSelect = useCallback((mode: ConnectionMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateSettings({ connectionMode: mode });
  }, [updateSettings]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Connection Mode</Text>
      <View style={styles.connectionModeContainer}>
        {modes.map((mode) => {
          const isActive = settings.connectionMode === mode.key;
          return (
            <TouchableOpacity
              key={mode.key}
              style={[
                styles.connectionModeCard,
                isActive && { borderColor: mode.color, backgroundColor: mode.color + '10' },
              ]}
              onPress={() => handleSelect(mode.key)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.connectionModeIconWrap,
                { backgroundColor: isActive ? mode.color + '20' : Colors.surfaceLight },
              ]}>
                {mode.icon}
              </View>
              <Text style={[
                styles.connectionModeLabel,
                isActive && { color: mode.color },
              ]}>
                {mode.label}
              </Text>
              <Text style={styles.connectionModeDesc} numberOfLines={2}>
                {mode.desc}
              </Text>
              {isActive && (
                <View style={[styles.connectionModeActiveDot, { backgroundColor: mode.color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function NetworkSettingsCard() {
  const { settings, updateSettings } = useAppSettings();

  const handleNetworkChange = useCallback(() => {
    Alert.alert(
      'Bitcoin Network',
      'Select network',
      [
        {
          text: 'Mainnet',
          onPress: () => {
            updateSettings({ bitcoinNetwork: 'mainnet' });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        },
        {
          text: 'Testnet',
          onPress: () => {
            updateSettings({ bitcoinNetwork: 'testnet' });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [updateSettings]);

  const handleCurrencyChange = useCallback(() => {
    Alert.alert(
      'Fiat Currency',
      'Select your preferred currency',
      [
        { text: 'EUR', onPress: () => updateSettings({ fiatCurrency: 'EUR' }) },
        { text: 'USD', onPress: () => updateSettings({ fiatCurrency: 'USD' }) },
        { text: 'GBP', onPress: () => updateSettings({ fiatCurrency: 'GBP' }) },
        { text: 'CHF', onPress: () => updateSettings({ fiatCurrency: 'CHF' }) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [updateSettings]);

  return (
    <View style={styles.sectionCard}>
      <SettingRow
        icon={<Globe size={18} color={Colors.accent} />}
        label="Network"
        value={settings.bitcoinNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}
        onPress={handleNetworkChange}
      />
      <SettingRow
        icon={<ExternalLink size={18} color={Colors.blue} />}
        label="Fiat Currency"
        value={settings.fiatCurrency}
        onPress={handleCurrencyChange}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [autoRelay, setAutoRelay] = React.useState<boolean>(true);
  const [notifications, setNotifications] = React.useState<boolean>(true);
  const [btEnabled, setBtEnabled] = React.useState<boolean>(false);
  const [showSeedQRScanner, setShowSeedQRScanner] = React.useState<boolean>(false);
  const { isInitialized, importWallet } = useWalletSeed();

  const handleSeedQRScanned = useCallback((mnemonic: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    importWallet(mnemonic);
    setShowSeedQRScanner(false);
    Alert.alert('Succès', 'Seed importée depuis SeedQR');
  }, [importWallet]);

  const handleToggle = useCallback((setter: (v: boolean) => void) => {
    return (val: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setter(val);
    };
  }, []);

  const showAlert = useCallback((title: string, message: string) => {
    Alert.alert(title, message);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>M</Text>
        </View>
        <View>
          <Text style={styles.profileName}>My Node</Text>
          <Text style={styles.profileNodeId}>MESH-LOCAL-9X2F</Text>
        </View>
      </View>

      <ConnectionModeSelector />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LoRa Radio</Text>
        <View style={styles.sectionCard}>
          <SettingRow
            icon={<Radio size={18} color={Colors.accent} />}
            label="Frequency"
            value="868 MHz"
            onPress={() => showAlert('Frequency', 'Configure your LoRa frequency band')}
          />
          <SettingRow
            icon={<Cpu size={18} color={Colors.blue} />}
            label="Spread Factor"
            value="SF12"
            onPress={() => showAlert('Spread Factor', 'Higher SF = longer range but slower')}
          />
          <SettingToggle
            icon={<Radio size={18} color={Colors.green} />}
            label="Auto Relay"
            value={autoRelay}
            onToggle={handleToggle(setAutoRelay)}
          />
          <SettingToggle
            icon={<Bluetooth size={18} color={Colors.blue} />}
            label="Bluetooth Serial"
            value={btEnabled}
            onToggle={handleToggle(setBtEnabled)}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bitcoin Wallet</Text>
        <SeedManagementCard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gateway & Relay</Text>
        <GatewayModeCard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Endpoints & Services</Text>
        <EndpointConfigCard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <NetworkSettingsCard />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.sectionCard}>
          <SettingToggle
            icon={<Bell size={18} color={Colors.textSecondary} />}
            label="Notifications"
            value={notifications}
            onToggle={handleToggle(setNotifications)}
          />
          <SettingRow
            icon={<HardDrive size={18} color={Colors.textSecondary} />}
            label="Storage"
            value="24.3 MB"
          />
          <SettingRow
            icon={<Info size={18} color={Colors.textSecondary} />}
            label="About MeshCore"
            value="v1.0.0"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Système</Text>
        <View style={styles.card}>
          <UpdateChecker />
        </View>
      </View>

      <Text style={styles.footer}>
        MeshCore LoRa x Bitcoin{'\n'}
        Off-grid. Decentralized. Sovereign.
      </Text>

      {/* SeedQR Scanner Modal */}
      <SeedQRScanner
        visible={showSeedQRScanner}
        onClose={() => setShowSeedQRScanner(false)}
        onSeedScanned={handleSeedQRScanned}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    margin: 16,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  profileAvatarText: {
    color: Colors.accent,
    fontSize: 22,
    fontWeight: '800' as const,
  },
  profileName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  profileNodeId: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: 15,
  },
  settingLabelDestructive: {
    color: Colors.red,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '40%',
  },
  settingValue: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  seedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
  },
  seedLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  seedLoadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  seedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  seedCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seedCardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  seedStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seedStatusActive: {
    backgroundColor: Colors.greenDim,
  },
  seedStatusInactive: {
    backgroundColor: Colors.redDim,
  },
  seedStatusText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  seedStatusTextActive: {
    color: Colors.green,
  },
  seedStatusTextInactive: {
    color: Colors.red,
  },
  walletInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  walletInfoLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  walletInfoValue: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  addressCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  showSeedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: Colors.accentGlow,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  showSeedText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  seedWordsContainer: {
    marginTop: 12,
  },
  seedWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.yellowDim,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  seedWarningText: {
    color: Colors.yellow,
    fontSize: 12,
    fontWeight: '600' as const,
    flex: 1,
  },
  seedWordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  seedWordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  seedWordIndex: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700' as const,
    fontFamily: 'monospace',
    minWidth: 14,
  },
  seedWordText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'monospace',
  },
  seedActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  seedActionSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  seedActionSmallText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  seedActionDestructive: {
    backgroundColor: Colors.redDim,
  },
  seedActionDestructiveText: {
    color: Colors.red,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  noSeedDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  generateButtons: {
    gap: 10,
    marginBottom: 12,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
  },
  generateButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  generateButton24: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    backgroundColor: Colors.accentGlow,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  generateButton24Text: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  importToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  importToggleText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  importContainer: {
    marginTop: 4,
    gap: 10,
  },
  importInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'monospace',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
  },
  importButtonText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  scanQRButton: {
    backgroundColor: Colors.blue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  scanQRButtonText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  endpointCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  endpointTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    flex: 1,
  },
  endpointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  endpointLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 50,
  },
  endpointUrl: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
    textAlign: 'right',
  },
  endpointUrlActive: {
    color: Colors.accent,
  },
  endpointUrlCashu: {
    color: Colors.cyan,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  customEndpointContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  endpointInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  saveEndpointBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 10,
    backgroundColor: Colors.accentGlow,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  testButtonCashu: {
    backgroundColor: Colors.cyanDim,
    borderColor: 'rgba(34, 211, 238, 0.3)',
  },
  testButtonText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  testButtonTextCashu: {
    color: Colors.cyan,
  },
  footer: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 20,
  },
  gatewayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 16,
    overflow: 'hidden',
  },
  gatewayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gatewayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gatewayTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  gatewayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gatewayPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gatewayModeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gatewayModeBadgeActive: {
    backgroundColor: Colors.greenDim,
  },
  gatewayModeBadgeInactive: {
    backgroundColor: Colors.surfaceHighlight,
  },
  gatewayModeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  gatewayModeTextActive: {
    color: Colors.green,
  },
  gatewayModeTextInactive: {
    color: Colors.textMuted,
  },
  gatewayDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  gatewayToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 14,
  },
  gatewayToggleBtnActive: {
    backgroundColor: Colors.redDim,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
  },
  gatewayToggleBtnInactive: {
    backgroundColor: Colors.greenDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 214, 143, 0.3)',
  },
  gatewayToggleText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  gatewayToggleTextActivate: {
    color: Colors.green,
  },
  gatewayToggleTextDeactivate: {
    color: Colors.red,
  },
  gatewayStatsGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  gatewayStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gatewayStatValue: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: '800' as const,
    fontFamily: 'monospace',
  },
  gatewayStatLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  gatewayServicesSection: {
    marginBottom: 8,
  },
  gatewayServicesTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 2,
  },
  mqttSection: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  mqttHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  mqttTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
    flex: 1,
  },
  mqttTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: Colors.purpleDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  mqttTestButtonText: {
    color: Colors.purple,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  relayLogToggle: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  relayLogToggleText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  relayLogContainer: {
    marginTop: 4,
    gap: 8,
  },
  relayLogItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  relayLogDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
  },
  relayLogContent: {
    flex: 1,
  },
  relayLogTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  relayLogType: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  relayLogTime: {
    color: Colors.textMuted,
    fontSize: 10,
    marginLeft: 'auto',
  },
  relayLogDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  relayLogMeta: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  connectionModeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  connectionModeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  connectionModeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  connectionModeLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  connectionModeDesc: {
    color: Colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 13,
  },
  connectionModeActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
