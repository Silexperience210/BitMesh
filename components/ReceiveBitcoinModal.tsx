/**
 * Modal pour recevoir du Bitcoin
 * Affiche l'adresse Bitcoin avec QR code scannable
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { X, Copy, Check } from 'lucide-react-native';
// QRCode nécessite: npm install react-native-qrcode-svg react-native-svg
// Commenté temporairement pour permettre le build
// import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface ReceiveBitcoinModalProps {
  visible: boolean;
  onClose: () => void;
  address: string;
  addresses?: string[]; // Adresses multiples si dérivation HD
}

export default function ReceiveBitcoinModal({
  visible,
  onClose,
  address,
  addresses = [],
}: ReceiveBitcoinModalProps) {
  const [copied, setCopied] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(address);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(selectedAddress);
      setCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de copier l\'adresse');
    }
  };

  const displayAddresses = addresses.length > 0 ? addresses : [address];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Recevoir Bitcoin</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* QR Code */}
            <View style={styles.qrContainer}>
              <View style={styles.qrWrapper}>
                {/* TODO: Installer react-native-qrcode-svg pour afficher le QR code */}
                {/* npm install react-native-qrcode-svg react-native-svg */}
                <View style={styles.qrPlaceholder}>
                  <Text style={styles.qrPlaceholderText}>📱</Text>
                  <Text style={styles.qrPlaceholderSubtext}>
                    Installez react-native-qrcode-svg{'\n'}pour afficher le QR code
                  </Text>
                </View>
                {/*
                <QRCode
                  value={selectedAddress}
                  size={220}
                  backgroundColor={Colors.surface}
                  color={Colors.text}
                  logo={require('@/assets/images/icon.png')}
                  logoSize={40}
                  logoBackgroundColor={Colors.surface}
                  logoBorderRadius={8}
                />
                */}
              </View>
            </View>

            {/* Adresse */}
            <View style={styles.addressContainer}>
              <Text style={styles.addressLabel}>Adresse Bitcoin</Text>
              <View style={styles.addressBox}>
                <Text style={styles.addressText} selectable>
                  {selectedAddress}
                </Text>
              </View>
            </View>

            {/* Bouton Copy */}
            <TouchableOpacity
              style={[styles.copyButton, copied && styles.copyButtonSuccess]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              {copied ? (
                <>
                  <Check size={20} color={Colors.black} />
                  <Text style={styles.copyButtonText}>Copié !</Text>
                </>
              ) : (
                <>
                  <Copy size={20} color={Colors.black} />
                  <Text style={styles.copyButtonText}>Copier l'adresse</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Sélection d'adresse (si plusieurs) */}
            {displayAddresses.length > 1 && (
              <View style={styles.addressListContainer}>
                <Text style={styles.addressListLabel}>
                  Autres adresses dérivées :
                </Text>
                {displayAddresses.map((addr, index) => (
                  <TouchableOpacity
                    key={addr}
                    style={[
                      styles.addressListItem,
                      addr === selectedAddress && styles.addressListItemActive,
                    ]}
                    onPress={() => {
                      setSelectedAddress(addr);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.addressListItemLeft}>
                      <Text style={styles.addressListItemIndex}>#{index + 1}</Text>
                      <Text
                        style={[
                          styles.addressListItemText,
                          addr === selectedAddress && styles.addressListItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {addr}
                      </Text>
                    </View>
                    {addr === selectedAddress && (
                      <Check size={16} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📱 Scannez ce QR code avec un wallet Bitcoin pour envoyer des fonds à
                cette adresse.
              </Text>
              <Text style={styles.infoText}>
                🔒 Chaque transaction génère une nouvelle adresse pour plus de
                confidentialité (BIP84/SegWit).
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrWrapper: {
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  qrPlaceholderText: {
    fontSize: 48,
    marginBottom: 12,
  },
  qrPlaceholderSubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  addressContainer: {
    marginBottom: 16,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: Colors.text,
    lineHeight: 20,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 24,
  },
  copyButtonSuccess: {
    backgroundColor: Colors.green,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
  },
  addressListContainer: {
    marginBottom: 24,
  },
  addressListLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  addressListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressListItemActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  addressListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  addressListItemIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    width: 30,
  },
  addressListItemText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Colors.textSecondary,
    flex: 1,
  },
  addressListItemTextActive: {
    color: Colors.accent,
  },
  infoBox: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
  },
});
