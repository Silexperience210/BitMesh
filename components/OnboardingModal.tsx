import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Wallet, Radio, MessageCircle, Shield, ArrowRight, X } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface OnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: Wallet,
    title: '1. Créez votre Wallet',
    description:
      'BitMesh utilise un wallet Bitcoin pour générer votre identité unique.\n\n' +
      'Votre identité MeshCore est dérivée cryptographiquement de votre clé privée.',
    color: Colors.accent,
  },
  {
    icon: Radio,
    title: '2. Connectez-vous',
    description:
      'Une fois le wallet créé, la messagerie se connecte automatiquement.\n\n' +
      'Votre nodeId (ex: MESH-A7F2) est votre identifiant unique sur le réseau.',
    color: Colors.green,
  },
  {
    icon: MessageCircle,
    title: '3. Communiquez',
    description:
      'Envoyez des messages privés (E2E chiffrés) ou rejoignez des forums publics.\n\n' +
      'Les messages sont effacés automatiquement après 24h pour votre sécurité.',
    color: Colors.cyan,
  },
  {
    icon: Shield,
    title: 'Sécurité garantie',
    description:
      '✓ Chiffrement de bout en bout\n' +
      '✓ Aucun serveur central\n' +
      '✓ Protection anti-usurpation\n' +
      '✓ Messages auto-destructibles',
    color: Colors.accent,
  },
];

export function OnboardingModal({ visible, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
      setStep(0);
    }
  };

  const handleSkip = () => {
    onClose();
    setStep(0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Bienvenue sur BitMesh</Text>
            <TouchableOpacity onPress={handleSkip} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Progress */}
          <View style={styles.progressRow}>
            {STEPS.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.progressDot,
                  idx === step && { backgroundColor: currentStep.color },
                  idx < step && { backgroundColor: Colors.textMuted },
                ]}
              />
            ))}
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.iconCircle, { backgroundColor: currentStep.color + '20' }]}>
              <Icon size={40} color={currentStep.color} />
            </View>

            <Text style={styles.stepTitle}>{currentStep.title}</Text>
            <Text style={styles.stepDescription}>{currentStep.description}</Text>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipText}>Passer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: currentStep.color }]}
              onPress={handleNext}
            >
              <Text style={styles.nextText}>
                {step === STEPS.length - 1 ? 'Commencer' : 'Suivant'}
              </Text>
              <ArrowRight size={16} color={Colors.black} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  progressDot: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 2,
  },
  content: {
    maxHeight: 300,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  stepDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  skipBtn: {
    padding: 12,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  nextText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
});
