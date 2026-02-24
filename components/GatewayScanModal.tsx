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
  TextInput,
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
  const [connecting, setConnecting] = React.useState(false);
  // Device sélectionné en attente de connexion
  const [pendingDevice, setPendingDevice] = React.useState<BleGatewayDevice | null>(null);
  // PIN BLE — MeshCore firmware défaut: 123456 (build flag BLE_PIN_CODE)
  const [pinValue, setPinValue] = React.useState('123456');

  const NUS_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

  // ── Permissions Android ──────────────────────────────────────────
  const requestPerms = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    try {
      if (Platform.Version >= 31) {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
      } else {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      }
    } catch (_) {
      // permissions déjà accordées ou erreur ignorée
    }
  };

  // ── Scan unifié (même code debug et scan normal) ─────────────────
  const runScan = async (debugMode: boolean) => {
    try {
      console.log('=== SCAN BLE START ===');
      // Demander les permissions avant de scanner
      await requestPerms();

      await BleManager.start({ showAlert: false });
      const bleState = await BleManager.checkState();
      if (bleState !== 'on') {
        Alert.alert('Bluetooth éteint', `État : ${bleState}\nAllumez le Bluetooth.`);
        return;
      }

      setLocalScanning(true);
      setLocalDevices([]);
      setPendingDevice(null);
      const found: Map<string, BleGatewayDevice> = new Map();

      const sub = BleManager.onDiscoverPeripheral((dev: any) => {
        if (!dev?.id) return;
        const name: string = dev.name || dev.advertising?.localName || '';
        const displayName = name || `BLE (${dev.id.slice(0, 8)})`;
        if (!found.has(dev.id)) {
          found.set(dev.id, {
            id: dev.id,
            name: displayName,
            rssi: dev.rssi || -100,
            type: (displayName.startsWith('MeshCore-') || displayName.startsWith('Whisper-'))
              ? 'companion' : 'gateway',
          });
          console.log('📱 TROUVÉ:', displayName, dev.id, dev.rssi);
        }
      });

      await BleManager.scan({ serviceUUIDs: [NUS_UUID], seconds: 8, allowDuplicates: false, scanMode: 2, matchMode: 1 } as any);

      setTimeout(async () => {
        sub.remove();
        try { await BleManager.stopScan(); } catch (_) {}
        const devices = Array.from(found.values());
        console.log('=== Scan terminé ===', devices.length, 'device(s)');

        setLocalDevices(devices);
        setLocalScanning(false);

        if (debugMode) {
          if (devices.length > 0) {
            Alert.alert(
              `${devices.length} device(s) trouvé(s)`,
              devices.map(d => `• ${d.name} (${d.rssi} dBm)`).join('\n'),
              [
                { text: 'Fermer', style: 'cancel' },
                {
                  text: `Connecter → ${devices[0].name}`,
                  onPress: () => setPendingDevice(devices[0]),
                },
              ]
            );
          } else {
            Alert.alert('Aucun device trouvé', 'Vérifiez que votre MeshCore est allumé et à proximité.');
          }
        }
      }, 8500);
    } catch (err: any) {
      setLocalScanning(false);
      console.error('❌ ERREUR SCAN:', err);
      Alert.alert('Scan impossible', err.message || 'Vérifiez que le Bluetooth est activé.');
    }
  };

  const handleScan = () => runScan(false);
  const handleDebugBle = () => runScan(true);

  // ── Connexion avec createBond + PIN ──────────────────────────────
  const doConnect = async () => {
    if (!pendingDevice) return;
    setConnecting(true);

    try {
      const pin = pinValue.trim();
      // PIN défaut firmware MeshCore = 123456 (-D BLE_PIN_CODE=123456 dans platformio.ini)
      console.log('[Connect] createBond PIN:', pin || '(aucun)');
      try {
        await BleManager.createBond(pendingDevice.id, pin || null);
        console.log('[Connect] Bond OK');
      } catch (bondErr: any) {
        const bMsg = String(bondErr).toLowerCase();
        const isWrongPin =
          bMsg.includes('133') || bMsg.includes('auth') ||
          bMsg.includes('pin') || bMsg.includes('passkey');
        if (isWrongPin) {
          // PIN incorrect → garder le panneau ouvert pour que l'user corrige
          Alert.alert('PIN incorrect', 'Vérifiez le PIN et réessayez.\nDéfaut MeshCore : 123456');
          setConnecting(false);
          return; // ne pas tenter la connexion GATT avec un bond raté
        }
        // Autre erreur bond (déjà bondé, Just Works…) → on continue
        console.log('[Connect] createBond non bloquant:', bondErr);
      }

      await connectToGateway(pendingDevice.id);
      // Succès : fermer le panneau et le modal
      setPendingDevice(null);
      onClose();
    } catch (err: any) {
      // Erreur GATT → garder pendingDevice ouvert pour retry
      const msg: string = err?.message ?? String(err);
      const isPairing = msg.includes('133') || msg.includes('pairing') ||
        msg.includes('bonding') || msg.includes('authentication');
      Alert.alert(
        isPairing ? 'PIN incorrect ou bond expiré' : 'Connexion échouée',
        isPairing
          ? 'Corrigez le PIN et réessayez.\nDéfaut MeshCore : 123456\n\nSi ça persiste : Paramètres Android → Bluetooth → supprimez "MeshCore-..." puis réessayez.'
          : msg + '\n\nAppuyez sur Connecter pour réessayer.'
      );
    } finally {
      setConnecting(false);
      // setPendingDevice(null) UNIQUEMENT en cas de succès (voir ci-dessus)
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
              <Text style={styles.connectedText}>Connecté à {device.name}</Text>
            </View>
          )}

          {/* Sélecteur de channel */}
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
                  style={[styles.channelOption, currentChannel === opt.idx && styles.channelOptionActive]}
                  onPress={() => { setChannel(opt.idx); setShowChannelPicker(false); }}
                >
                  <Text style={[styles.channelOptionText, currentChannel === opt.idx && styles.channelOptionTextActive]}>
                    {opt.icon} {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Panel de connexion (apparaît quand un device est sélectionné) */}
          {pendingDevice && !connecting && (
            <View style={styles.connectPanel}>
              <Text style={styles.connectTitle}>Connecter à {pendingDevice.name}</Text>
              <View style={styles.pinRow}>
                <Text style={styles.pinLabel}>PIN (optionnel) :</Text>
                <TextInput
                  style={styles.pinInput}
                  value={pinValue}
                  onChangeText={setPinValue}
                  placeholder="Ex: 1234"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  maxLength={8}
                />
              </View>
              <Text style={styles.pinHint}>
                Défaut firmware MeshCore : 123456{'\n'}
                Si votre device a un écran, entrez le PIN affiché.
              </Text>
              <View style={styles.connectBtnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setPendingDevice(null)}>
                  <Text style={styles.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.connectBtn} onPress={doConnect}>
                  <Text style={styles.connectBtnText}>Connecter</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Spinner connexion */}
          {connecting && (
            <View style={styles.bondingBanner}>
              <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: 8 }} />
              <Text style={styles.bondingText}>Connexion en cours...</Text>
            </View>
          )}

          {/* Erreur BLE */}
          {error && !localScanning && !connecting && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {/* Boutons scan */}
          {!pendingDevice && !connecting && (
            <>
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

              <TouchableOpacity style={styles.debugButton} onPress={handleDebugBle} disabled={localScanning}>
                <Bug size={16} color={Colors.textMuted} />
                <Text style={styles.debugButtonText}>Debug BLE (scan + alert + connecter)</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Liste des devices */}
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Appareils BLE détectés ({localDevices.length})</Text>
            {localDevices.length === 0 && !localScanning ? (
              <Text style={styles.emptyText}>
                Aucun appareil trouvé. Vérifiez que votre device MeshCore est allumé et à proximité.
              </Text>
            ) : (
              <FlatList
                data={localDevices}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <DeviceItem device={item} onSelect={setPendingDevice} />
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
  onSelect: (device: BleGatewayDevice) => void;
}

function DeviceItem({ device, onSelect }: DeviceItemProps) {
  const signalColor = device.rssi > -70 ? Colors.green : device.rssi > -85 ? Colors.accent : Colors.red;
  const typeColor = device.type === 'gateway' ? Colors.cyan : Colors.yellow;
  const typeLabel = device.type === 'gateway' ? 'Gateway' : 'Compagnon';

  return (
    <TouchableOpacity style={styles.deviceItem} onPress={() => onSelect(device)}>
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
          <Text style={[styles.signalText, { color: signalColor }]}>{device.rssi} dBm</Text>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    marginBottom: 12,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.green,
  },
  connectPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.accent + '60',
  },
  connectTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pinLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    width: 110,
  },
  pinInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  pinHint: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  connectBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  connectBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  connectBtnText: {
    fontSize: 14,
    color: Colors.background,
    fontWeight: '700',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
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
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: `${Colors.red}20`,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
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
    marginBottom: 12,
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
