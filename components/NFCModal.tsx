import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, Nfc, Upload, Download } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { isNFCAvailable, writeTransactionToNFC, readTransactionFromNFC, type NFCTransactionRecord } from '@/utils/nfc';

interface NFCModalProps {
  visible: boolean;
  onClose: () => void;
  txHex?: string;
  txid?: string;
  onTxRead?: (record: NFCTransactionRecord) => void;
}

export default function NFCModal({ visible, onClose, txHex, txid, onTxRead }: NFCModalProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [mode, setMode] = useState<'read' | 'write' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (visible) {
      checkNFC();
    }
  }, [visible]);

  const checkNFC = async () => {
    setIsChecking(true);
    const available = await isNFCAvailable();
    setIsAvailable(available);
    setIsChecking(false);
  };

  const handleWrite = async () => {
    if (!txHex || !txid) {
      Alert.alert('Erreur', 'Aucune transaction à écrire');
      return;
    }

    setIsProcessing(true);
    const result = await writeTransactionToNFC({
      txHex,
      txid,
      timestamp: Date.now(),
      description: 'Transaction BitMesh',
    });
    setIsProcessing(false);

    if (result.success) {
      Alert.alert('Succès', 'Transaction écrite sur la carte NFC');
      onClose();
    } else {
      Alert.alert('Erreur', result.error || 'Échec de l\'écriture NFC');
    }
  };

  const handleRead = async () => {
    setIsProcessing(true);
    const result = await readTransactionFromNFC();
    setIsProcessing(false);

    if (result.success && result.record) {
      Alert.alert(
        'Transaction lue',
        `TXID: ${result.record.txid.slice(0, 16)}...`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Utiliser',
            onPress: () => {
              onTxRead?.(result.record!);
              onClose();
            },
          },
        ]
      );
    } else {
      Alert.alert('Erreur', result.error || 'Échec de la lecture NFC');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>NFC</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {isChecking ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.text}>Vérification NFC...\u003c/Text>
            </View>
          ) : !isAvailable ? (
            <View style={styles.center}>
              <Nfc size={48} color={Colors.textMuted} />
              <Text style={styles.text}>NFC non disponible\u003c/Text>
              <Text style={styles.subtext}>
                Cet appareil ne supporte pas le NFC, ou la permission est refusée.
              </Text>
            </View>
          ) : mode === null ? (
            <View style={styles.options}>
              {txHex && (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => setMode('write')}
                >
                  <Upload size={32} color={Colors.accent} />
                  <Text style={styles.optionText}>Écrire sur NFC\u003c/Text>
                  <Text style={styles.optionSubtext}>
                    Sauvegarder la transaction sur une carte NFC
                  </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.option}
                onPress={() => setMode('read')}
              >
                <Download size={32} color={Colors.blue} />
                <Text style={styles.optionText}>Lire depuis NFC\u003c/Text>
                <Text style={styles.optionSubtext}>
                  Charger une transaction depuis une carte NFC
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.center}>
              <Nfc size={64} color={Colors.accent} />
              <Text style={styles.text}>
                {mode === 'write' ? 'Approchez la carte NFC' : 'Approchez la carte NFC'}
              </Text>
              
              {isProcessing ? (
                <ActivityIndicator color={Colors.accent} style={styles.spinner} />
              ) : (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={mode === 'write' ? handleWrite : handleRead}
                >
                  <Text style={styles.actionButtonText}>
                    {mode === 'write' ? 'Écrire' : 'Lire'}
                  </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setMode(null)}
              >
                <Text style={styles.backButtonText}>Retour\u003c/Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    padding: 8,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  text: {
    fontSize: 16,
    color: Colors.text,
    marginTop: 16,
  },
  subtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  options: {
    gap: 16,
  },
  option: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
  },
  optionSubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 24,
  },
  actionButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  actionButtonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
