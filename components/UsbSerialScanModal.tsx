/**
 * Modal de scan et connexion USB Serial pour MeshCore
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Usb, X, CheckCircle2, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useUsbSerial, type UsbDevice } from '@/providers/UsbSerialProvider';

interface UsbSerialScanModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UsbSerialScanModal({ visible, onClose }: UsbSerialScanModalProps) {
  const {
    availableDevices,
    connected,
    device,
    hasPermission,
    scanForDevices,
    connectToDevice,
    requestPermission,
  } = useUsbSerial();

  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) return;
    }
    setIsScanning(true);
    await scanForDevices();
    setIsScanning(false);
  };

  const handleConnect = async (deviceId: number) => {
    try {
      await connectToDevice(deviceId);
      onClose();
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
              <Usb size={24} color={Colors.accent} />
              <Text style={styles.title}>Connexion USB Serial</Text>
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
                Connecté à {device.name} (USB)
              </Text>
            </View>
          )}

          {/* Info USB */}
          <View style={styles.infoBox}>
            <AlertCircle size={16} color={Colors.textMuted} />
            <Text style={styles.infoText}>
              Connectez votre device MeshCore via câble USB-C/USB. 
              Assurez-vous que le mode USB Serial est activé sur le device.
            </Text>
          </View>

          {/* Bouton Scan */}
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
            onPress={handleScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <ActivityIndicator size="small" color={Colors.background} />
                <Text style={styles.scanButtonText}>Scan en cours...</Text>
              </>
            ) : (
              <>
                <Usb size={20} color={Colors.background} />
                <Text style={styles.scanButtonText}>Scanner les devices USB</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Liste des devices */}
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>
              Devices USB détectés ({availableDevices.length})
            </Text>
            {availableDevices.length === 0 && !isScanning ? (
              <Text style={styles.emptyText}>
                Aucun device USB trouvé. Connectez votre device MeshCore 
                et assurez-vous qu'il est en mode USB Serial.
              </Text>
            ) : (
              <FlatList
                data={availableDevices}
                keyExtractor={(item) => item.id.toString()}
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
  device: UsbDevice;
  onConnect: (deviceId: number) => void;
}

function DeviceItem({ device, onConnect }: DeviceItemProps) {
  return (
    <TouchableOpacity style={styles.deviceItem} onPress={() => onConnect(device.id)}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceId}>
          ID: {device.id} | Vendor: {device.vendorId.toString(16)} | Product: {device.productId.toString(16)}
        </Text>
      </View>
      <View style={styles.deviceRight}>
        <View style={styles.usbBadge}>
          <Text style={styles.usbText}>USB</Text>
        </View>
        <Usb size={20} color={Colors.accent} />
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
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
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  deviceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  usbBadge: {
    backgroundColor: `${Colors.accent}20`,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  usbText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
  },
});
