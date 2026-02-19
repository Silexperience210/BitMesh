import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { X, Scan, QrCode } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { isValidSeedQR, seedQRDataToSeed } from '@/utils/seedqr';

interface SeedQRScannerProps {
  visible: boolean;
  onClose: () => void;
  onSeedScanned: (mnemonic: string) => void;
}

export default function SeedQRScanner({ visible, onClose, onSeedScanned }: SeedQRScannerProps) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible && !hasPermission) {
      requestPermission();
    }
  }, [visible, hasPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scanned || codes.length === 0) return;
      
      const data = codes[0].value;
      if (!data) return;
      
      setScanned(true);
      
      try {
        // Vérifier si c'est une seed valide
        if (isValidSeedQR(data)) {
          Alert.alert(
            'SeedQR détecté',
            'Voulez-vous importer cette seed ?',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => setScanned(false) },
              {
                text: 'Importer',
                onPress: () => {
                  onSeedScanned(data.trim().toLowerCase());
                  onClose();
                },
              },
            ]
          );
        } else {
          Alert.alert(
            'QR Code invalide',
            'Ce QR code ne contient pas une seed BIP39 valide.',
            [{ text: 'OK', onPress: () => setScanned(false) }]
          );
        }
      } catch (error) {
        console.error('[SeedQR] Erreur scan:', error);
        Alert.alert('Erreur', 'Impossible de lire le QR code');
        setScanned(false);
      }
    },
  });

  if (!hasPermission) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Scanner SeedQR</Text>
          </View>
          
          <View style={styles.permissionContainer}>
            <QrCode size={64} color={Colors.textMuted} />
            <Text style={styles.permissionText}>
              Permission caméra requise pour scanner les SeedQR
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (device == null) {
    return (
      <Modal visible={visible} animationType="slide" transparent={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Scanner SeedQR</Text>
          </View>
          
          <View style={styles.permissionContainer}>
            <QrCode size={64} color={Colors.textMuted} />
            <Text style={styles.permissionText}>
              Aucune caméra disponible sur cet appareil
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Scanner SeedQR</Text>
        </View>

        <View style={styles.cameraContainer}>
          <Camera
            style={styles.camera}
            device={device}
            isActive={visible && !scanned}
            codeScanner={codeScanner}
          />
          
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <Scan size={48} color={Colors.accent} />
            </View>
            <Text style={styles.scanText}>
              Placez le SeedQR dans le cadre
            </Text>
          </View>
        </View>

        {scanned && (
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => setScanned(false)}
          >
            <Text style={styles.rescanText}>Scanner à nouveau</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: Colors.surface,
  },
  closeButton: {
    padding: 8,
    marginRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanText: {
    marginTop: 24,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
  },
  rescanButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  rescanText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 24,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
});
