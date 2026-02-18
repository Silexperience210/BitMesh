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
} from 'react-native';
import { Bluetooth, X, Wifi, CheckCircle2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useBle } from '@/providers/BleProvider';
import { type BleGatewayDevice } from '@/utils/ble-gateway';

interface GatewayScanModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function GatewayScanModal({ visible, onClose }: GatewayScanModalProps) {
  const { scanning, availableDevices, connected, device, scanForGateways, connectToGateway } =
    useBle();

  const handleScan = async () => {
    try {
      await scanForGateways();
    } catch (error) {
      console.error('Scan error:', error);
    }
  };

  const handleConnect = async (deviceId: string) => {
    try {
      await connectToGateway(deviceId);
      onClose(); // Fermer le modal après connexion
    } catch (error) {
      console.error('Connection error:', error);
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

          {/* Bouton Scan */}
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.scanButtonDisabled]}
            onPress={handleScan}
            disabled={scanning}
          >
            {scanning ? (
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

          {/* Liste des devices */}
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Gateways disponibles ({availableDevices.length})</Text>
            {availableDevices.length === 0 && !scanning ? (
              <Text style={styles.emptyText}>
                Aucun gateway trouvé. Assurez-vous que votre gateway ESP32 est allumé et à proximité.
              </Text>
            ) : (
              <FlatList
                data={availableDevices}
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

  return (
    <TouchableOpacity style={styles.deviceItem} onPress={() => onConnect(device.id)}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceId}>{device.id.slice(0, 17)}</Text>
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
