/**
 * Modal de scan et connexion gateway LoRa BLE
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { Bluetooth, X, Wifi, CheckCircle2, Radio, Bug } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useBle } from '@/providers/BleProvider';
import { type BleGatewayDevice } from '@/utils/ble-gateway';

const CHANNEL_OPTIONS = [
  { idx: 0, label: 'Public (ch0)', icon: '🌐' },
  { idx: 1, label: 'Privé 1 (ch1)', icon: '🔒' },
  { idx: 2, label: 'Privé 2 (ch2)', icon: '🔒' },
  { idx: 3, label: 'Privé 3 (ch3)', icon: '🔒' },
  { idx: 4, label: 'Privé 4 (ch4)', icon: '🔒' },
];

interface GatewayScanModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function GatewayScanModal({ visible, onClose }: GatewayScanModalProps) {
  const { connected, device, error, connectToGateway, currentChannel, setChannel } = useBle();

  const [showChannelPicker, setShowChannelPicker] = React.useState(false);
  const [localScanning, setLocalScanning] = React.useState(false);
  const [localDevices, setLocalDevices] = React.useState<BleGatewayDevice[]>([]);

  const NUS_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

  const requestPerms = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        granted['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
        granted['android.permission.BLUETOOTH_CONNECT'] === 'granted'
      );
    } else {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return r === 'granted';
    }
  };

  const handleScan = async () => {
    try {
      const ok = await requestPerms();
      if (!ok) {
        Alert.alert('Permissions BLE requises', 'Accordez les permissions Bluetooth dans les paramètres.');
        return;
      }

      await BleManager.start({ showAlert: false });
      const bleState = await BleManager.checkState();
      if (bleState !== 'on') {
        Alert.alert('Bluetooth éteint', `État : ${bleState}\nAllumez le Bluetooth.`);
        return;
      }

      setLocalScanning(true);
      setLocalDevices([]);
      const found = new Map<string, BleGatewayDevice>();

      const addDevice = (peripheral: any) => {
        if (!peripheral?.id) return;
        const name: string = peripheral.name || peripheral.advertising?.localName || '';
        const displayName = name || `BLE (${peripheral.id.slice(0, 8)})`;
        if (!found.has(peripheral.id)) {
          found.set(peripheral.id, {
            id: peripheral.id,
            name: displayName,
            rssi: peripheral.rssi || -100,
            type: (displayName.startsWith('MeshCore-') || displayName.startsWith('Whisper-'))
              ? 'companion' : 'gateway',
          });
          console.log(`[Scan] "${displayName}" ${peripheral.rssi}dBm`);
        }
      };

      // ── Scan 1 : NUS UUID filter (8s) ─────────────────────────────────
      console.log('[Scan] NUS UUID 8s...');
      const l1 = BleManager.onDiscoverPeripheral(addDevice);
      await BleManager.scan({ serviceUUIDs: [NUS_UUID], seconds: 8, allowDuplicates: false, scanMode: 2, matchMode: 1 } as any);

      setTimeout(async () => {
        l1.remove();
        try { await BleManager.stopScan(); } catch (_) {}
        console.log(`[Scan] NUS → ${found.size} device(s)`);

        if (found.size > 0) {
          setLocalDevices(Array.from(found.values()));
          setLocalScanning(false);
          return;
        }

        // ── Scan 2 : Fallback universel (8s) ──────────────────────────
        console.log('[Scan] Fallback universel 8s...');
        const l2 = BleManager.onDiscoverPeripheral(addDevice);
        await BleManager.scan({ serviceUUIDs: [], seconds: 8, allowDuplicates: false, scanMode: 2, matchMode: 1 } as any);

        setTimeout(async () => {
          l2.remove();
          try { await BleManager.stopScan(); } catch (_) {}
          console.log(`[Scan] Universal → ${found.size} device(s)`);
          setLocalDevices(Array.from(found.values()));
          setLocalScanning(false);
        }, 8500);
      }, 8500);
    } catch (err: any) {
      setLocalScanning(false);
      Alert.alert('Scan impossible', err.message || 'Vérifiez que le Bluetooth est activé et les permissions accordées.');
    }
  };

  const [connecting, setConnecting] = React.useState(false);

  const handleDebugBle = async () => {
    try {
      console.log('=== DEBUG BLE START ===');

      await BleManager.start({ showAlert: false });
      console.log('✅ BleManager démarré');

      const bleState = await BleManager.checkState();
      console.log('📡 BLE State:', bleState);

      if (bleState !== 'on') {
        Alert.alert('Bluetooth éteint', `État : ${bleState}\nAllumez le Bluetooth.`);
        return;
      }

      let permStatus = 'N/A';
      if (Platform.OS === 'android' && Platform.Version >= 31) {
        const scan = await PermissionsAndroid.check('android.permission.BLUETOOTH_SCAN' as any);
        const conn = await PermissionsAndroid.check('android.permission.BLUETOOTH_CONNECT' as any);
        permStatus = `SCAN=${scan ? '✅' : '❌'} CONNECT=${conn ? '✅' : '❌'}`;
        console.log('🔐 Permissions:', permStatus);
      }

      console.log('🔍 Scan 8s — v12 TurboModule API (NUS UUID filter)...');
      const found: Map<string, any> = new Map();

      const sub = BleManager.onDiscoverPeripheral((dev: any) => {
        if (!dev?.id) return;
        const name = dev.name || dev.advertising?.localName || 'SANS NOM';
        if (!found.has(dev.id)) {
          found.set(dev.id, { name, id: dev.id, rssi: dev.rssi });
          console.log('📱 TROUVÉ:', name, dev.id, dev.rssi);
        }
      });

      await BleManager.scan({ serviceUUIDs: [NUS_UUID], seconds: 8, allowDuplicates: false, scanMode: 2, matchMode: 1 } as any);

      setTimeout(async () => {
        sub.remove();
        try { await BleManager.stopScan(); } catch (_) {}
        const devices = Array.from(found.values());
        console.log('=== Scan terminé ===', devices.length, 'device(s) uniques');
        Alert.alert(
          `${devices.length} device(s) MeshCore trouvé(s)`,
          `Permissions: ${permStatus}\nFiltre: NUS UUID\n\n` +
          (devices.map((d: any) => `• ${d.name}\n  ${d.id.slice(0, 17)}\n  (${d.rssi} dBm)`).join('\n\n') || 'Aucun device MeshCore détecté')
        );
      }, 8500);
    } catch (err: any) {
      console.error('❌ ERREUR DEBUG BLE:', err);
      Alert.alert('Erreur BLE', err.message);
    }
  };

  const handleConnect = async (deviceId: string) => {
    setConnecting(true);
    try {
      await connectToGateway(deviceId);
      onClose(); // Fermer le modal après connexion
    } catch (err) {
      console.error('Connection error:', err);
      // L'erreur est affichée via ble.error (BleProvider)
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Bluetooth size={24} color={Colors.accent} />
              <Text style={styles.title}>Scanner Gateway LoRa</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Status connexion actuelle */}
          {connected && device && (
            <View style={styles.connectedBanner}>
              <CheckCircle2 size={20} color={Colors.green} />
              <Text style={styles.connectedText}>
                Connecté à {device.name}
              </Text>
            </View>
          )}

          {/* Sélecteur de channel (visible uniquement si connecté) */}
          {connected && (
            <View style={styles.channelRow}>
              <Radio size={16} color={Colors.textMuted} />
              <Text style={styles.channelLabel}>Channel actif :</Text>
              <View style={[styles.channelBadge, { backgroundColor: currentChannel === 0 ? `${Colors.green}20` : `${Colors.purple}20` }]}>
                <Text style={[styles.channelText, { color: currentChannel === 0 ? Colors.green : Colors.purple }]}>
                  {currentChannel === 0 ? '🌐 Public (ch0)' : `🔒 Privé (ch${currentChannel})`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowChannelPicker(v => !v)}>
                <Text style={styles.channelChange}>Changer →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Picker de channel */}
          {connected && showChannelPicker && (
            <View style={styles.channelPickerContainer}>
              {CHANNEL_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.idx}
                  style={[
                    styles.channelOption,
                    currentChannel === opt.idx && styles.channelOptionActive,
                  ]}
                  onPress={() => {
                    setChannel(opt.idx);
                    setShowChannelPicker(false);
                  }}
                >
                  <Text style={[
                    styles.channelOptionText,
                    currentChannel === opt.idx && styles.channelOptionTextActive,
                  ]}>
                    {opt.icon} {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Bouton Scan */}
          <TouchableOpacity
            style={[styles.scanButton, localScanning && styles.scanButtonDisabled]}
            onPress={handleScan}
            disabled={localScanning}
          >
            {localScanning ? (
              <>
                <ActivityIndicator size="small" color={Colors.background} />
                <Text style={styles.scanButtonText}>Scan en cours...</Text>
              </>
            ) : (
              <>
                <Wifi size={20} color={Colors.background} />
                <Text style={styles.scanButtonText}>Démarrer le scan</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Bouton DEBUG BLE — test scan brut sans BleProvider */}
          <TouchableOpacity style={styles.debugButton} onPress={handleDebugBle}>
            <Bug size={16} color={Colors.textMuted} />
            <Text style={styles.debugButtonText}>Debug BLE brut (5s)</Text>
          </TouchableOpacity>

          {/* Appairage en cours */}
          {connecting && (
            <View style={styles.bondingBanner}>
              <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: 8 }} />
              <Text style={styles.bondingText}>
                Appairage BLE en cours...{'\n'}
                <Text style={styles.bondingBold}>Entrez le PIN dans le dialogue Android (défaut : 123456)</Text>
              </Text>
            </View>
          )}

          {/* Erreur BLE */}
          {error && !localScanning && !connecting && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {/* Info PIN */}
          {!connecting && (
            <View style={styles.infoBanner}>
              <Text style={styles.infoText}>
                PIN BLE par défaut : <Text style={styles.infoBold}>123456</Text>
              </Text>
            </View>
          )}

          {/* Liste des devices */}
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Appareils BLE détectés ({localDevices.length})</Text>
            {localDevices.length === 0 && !localScanning ? (
              <Text style={styles.emptyText}>
                Aucun appareil trouvé. Vérifiez que votre device MeshCore Companion est allumé et à proximité, et que le firmware BLE est installé.
              </Text>
            ) : (
              <FlatList
                data={localDevices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <DeviceItem device={item} onConnect={handleConnect} />
                )}
                style={styles.list}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface DeviceItemProps {
  device: BleGatewayDevice;
  onConnect: (deviceId: string) => void;
}

function DeviceItem({ device, onConnect }: DeviceItemProps) {
  const signalColor =
    device.rssi > -70 ? Colors.green : device.rssi > -85 ? Colors.accent : Colors.red;

  // ✅ NOUVEAU: Couleur et label selon le type
  const typeColor = device.type === 'gateway' ? Colors.cyan : Colors.yellow;
  const typeLabel = device.type === 'gateway' ? 'Gateway' : 'Compagnon';

  return (
    <TouchableOpacity style={styles.deviceItem} onPress={() => onConnect(device.id)}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <View style={styles.deviceMeta}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}20` }]}>
            <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.deviceId}>{device.id.slice(0, 17)}</Text>
        </View>
      </View>
      <View style={styles.deviceRight}>
        <View style={[styles.signalBadge, { backgroundColor: `${signalColor}20` }]}>
          <Text style={[styles.signalText, { color: signalColor }]}>
            {device.rssi} dBm
          </Text>
        </View>
        <Bluetooth size={20} color={Colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${Colors.green}20`,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.green,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.background,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 14,
  },
  debugButtonText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  bondingBanner: {
    backgroundColor: `${Colors.accent}20`,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.accent}50`,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bondingText: {
    color: Colors.accent,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  bondingBold: {
    fontWeight: '700',
    color: Colors.accent,
  },
  infoBanner: {
    backgroundColor: `${Colors.accent}15`,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  infoBold: {
    color: Colors.accent,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  errorBanner: {
    backgroundColor: `${Colors.red}20`,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.red}40`,
  },
  errorText: {
    color: Colors.red,
    fontSize: 13,
    fontWeight: '600',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  channelLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  channelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  channelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  channelChange: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600',
  },
  channelPickerContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  channelOption: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  channelOptionActive: {
    backgroundColor: `${Colors.accent}20`,
  },
  channelOptionText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  channelOptionTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  listContainer: {
    flex: 1,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 10,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  deviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  deviceId: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  deviceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signalBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  signalText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
});
