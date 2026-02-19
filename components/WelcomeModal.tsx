import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Wallet, Radio, MessageCircle, Shield, X } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Bienvenue sur BitMesh</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Étape 1 */}
            <View style={styles.step}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.accent + '20' }]}>
                <Wallet size={24} color={Colors.accent} />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>1. Créez votre Wallet</Text>
                <Text style={styles.stepDesc}>
                  Générez 12 mots dans Settings → Wallet. Votre identité MeshCore est dérivée de cette clé.
                </Text>
              </View>
            </View>

            {/* Étape 2 */}
            <View style={styles.step}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.green + '20' }]}>
                <Radio size={24} color={Colors.green} />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>2. Connectez-vous</Text>
                <Text style={styles.stepDesc}>
                  La messagerie se connecte automatiquement. Votre nodeId (ex: MESH-A7F2) est unique.
                </Text>
              </View>
            </View>

            {/* Étape 3 */}
            <View style={styles.step}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.cyan + '20' }]}>
                <MessageCircle size={24} color={Colors.cyan} />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>3. Communiquez</Text>
                <Text style={styles.stepDesc}>
                  Messages privés chiffrés ou forums publics. Les messages s'effacent après 24h.
                </Text>
              </View>
            </View>

            {/* Sécurité */}
            <View style={[styles.step, styles.securityStep]}>
              <View style={[styles.iconCircle, { backgroundColor: Colors.accent + '20' }]}>
                <Shield size={24} color={Colors.accent} />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>Sécurité</Text>
                <Text style={styles.stepDesc}>
                  ✓ Chiffrement E2E{'\n'}
                  ✓ Pas de serveur central{'\n'}
                  ✓ Protection anti-usurpation{'\n'}
                  ✓ Messages auto-destructibles
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>J'ai compris</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    maxHeight: 400,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  securityStep: {
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
});
