/**
 * RadioConfigModal - Configuration Radio et Canaux MeshCore
 * 
 * Permet de:
 * 1. Configurer les canaux logiques (0-7) avec nom et secret
 * 2. Afficher la fréquence radio actuelle (en lecture seule, définie dans le firmware)
 * 3. Changer de canal actif pour les broadcasts
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, Radio, Wifi, Lock, Hash, Info, Check, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useBle } from '@/providers/BleProvider';

interface RadioConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

const CHANNEL_OPTIONS = [
  { idx: 0, label: '🌐 Public (ch0)', icon: '🌐', desc: 'Broadcast ouvert à tous' },
  { idx: 1, label: '🔒 Privé 1 (ch1)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 2, label: '🔒 Privé 2 (ch2)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 3, label: '🔒 Privé 3 (ch3)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 4, label: '🔒 Privé 4 (ch4)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 5, label: '🔒 Privé 5 (ch5)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 6, label: '🔒 Privé 6 (ch6)', icon: '🔒', desc: 'Canal privé chiffré' },
  { idx: 7, label: '🔒 Privé 7 (ch7)', icon: '🔒', desc: 'Canal privé chiffré' },
];

const FREQUENCY_PRESETS = [
  { name: 'Europe 868', freq: 869525000, sf: 11, bw: 250000 },
  { name: 'US 915', freq: 915000000, sf: 10, bw: 125000 },
  { name: 'Asia 433', freq: 433000000, sf: 11, bw: 125000 },
];

export default function RadioConfigModal({ visible, onClose }: RadioConfigModalProps) {
  const { 
    deviceInfo, 
    connected, 
    currentChannel, 
    setChannel, 
    configureChannel,
    channelConfigured 
  } = useBle();

  const [activeTab, setActiveTab] = useState<'channel' | 'radio'>('channel');
  const [selectedChannel, setSelectedChannel] = useState(currentChannel);
  const [channelName, setChannelName] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [configuring, setConfiguring] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Reset quand le modal s'ouvre
  useEffect(() => {
    if (visible) {
      setSelectedChannel(currentChannel);
      setChannelName('');
      setChannelSecret('');
    }
  }, [visible, currentChannel]);

  const handleSetActiveChannel = async () => {
    if (!connected) {
      Alert.alert('Non connecté', 'Connectez-vous d\'abord à un device BLE');
      return;
    }
    
    setChannel(selectedChannel);
    Alert.alert(
      'Canal changé',
      `Vous êtes maintenant sur ${CHANNEL_OPTIONS[selectedChannel].label}`
    );
  };

  const handleConfigureChannel = async () => {
    if (!connected) {
      Alert.alert('Non connecté', 'Connectez-vous d\'abord à un device BLE');
      return;
    }

    if (!channelName.trim()) {
      Alert.alert('Nom requis', 'Entrez un nom pour le canal');
      return;
    }

    setConfiguring(true);
    try {
      // Générer un secret si vide (canal public)
      const secret = channelSecret.trim() || 'public';
      
      await configureChannel(selectedChannel, channelName.trim(), secret);
      
      Alert.alert(
        '✅ Canal configuré',
        `Canal ${selectedChannel} "${channelName}" configuré avec succès!\n\n` +
        `Secret: ${secret === 'public' ? 'Public (aucun)' : '********'}`
      );
      
      setChannelName('');
      setChannelSecret('');
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Échec de la configuration');
    } finally {
      setConfiguring(false);
    }
  };

  const formatFreq = (hz: number): string => {
    if (hz >= 1000000) {
      return `${(hz / 1000000).toFixed(3)} MHz`;
    }
    return `${hz} Hz`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <Radio size={22} color={Colors.accent} />
              </View>
              <View>
                <Text style={styles.title}>Configuration Radio</Text>
                <Text style={styles.subtitle}>
                  {connected ? '🟢 Connecté' : '🔴 Déconnecté'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'channel' && styles.tabActive]}
              onPress={() => setActiveTab('channel')}
            >
              <Hash size={16} color={activeTab === 'channel' ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, activeTab === 'channel' && styles.tabTextActive]}>
                Canaux
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'radio' && styles.tabActive]}
              onPress={() => setActiveTab('radio')}
            >
              <Wifi size={16} color={activeTab === 'radio' ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, activeTab === 'radio' && styles.tabTextActive]}>
                Fréquence
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'channel' ? (
              <View style={styles.channelSection}>
                {/* Canal Actuel */}
                <View style={styles.currentChannelCard}>
                  <Text style={styles.sectionTitle}>Canal Actif</Text>
                  <View style={styles.currentChannelBadge}>
                    <Text style={styles.currentChannelEmoji}>
                      {CHANNEL_OPTIONS[currentChannel]?.icon || '📡'}
                    </Text>
                    <View>
                      <Text style={styles.currentChannelLabel}>
                        {CHANNEL_OPTIONS[currentChannel]?.label || `Canal ${currentChannel}`}
                      </Text>
                      <Text style={styles.currentChannelStatus}>
                        {channelConfigured ? '✓ Configuré' : '⚠ Non configuré'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sélection Canal */}
                <Text style={styles.sectionTitle}>Choisir le Canal</Text>
                <View style={styles.channelGrid}>
                  {CHANNEL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.idx}
                      style={[
                        styles.channelOption,
                        selectedChannel === opt.idx && styles.channelOptionSelected,
                        currentChannel === opt.idx && styles.channelOptionActive,
                      ]}
                      onPress={() => setSelectedChannel(opt.idx)}
                    >
                      <Text style={styles.channelEmoji}>{opt.icon}</Text>
                      <Text style={styles.channelLabel}>{opt.label}</Text>
                      {currentChannel === opt.idx && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>ACTIF</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.actionBtn, !connected && styles.actionBtnDisabled]}
                  onPress={handleSetActiveChannel}
                  disabled={!connected}
                >
                  <Check size={18} color={Colors.black} />
                  <Text style={styles.actionBtnText}>Utiliser ce Canal</Text>
                </TouchableOpacity>

                {/* Configuration Canal */}
                <View style={styles.configSection}>
                  <Text style={styles.sectionTitle}>Configurer le Canal {selectedChannel}</Text>
                  <Text style={styles.configDesc}>
                    {selectedChannel === 0 
                      ? 'Le canal 0 (public) est utilisé pour les broadcasts. Laissez vide pour un canal public.'
                      : 'Les canaux privés nécessitent un nom et un secret partagé entre tous les participants.'}
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Nom du canal</Text>
                    <TextInput
                      style={styles.input}
                      value={channelName}
                      onChangeText={setChannelName}
                      placeholder={selectedChannel === 0 ? "public" : "mon-canal-secret"}
                      placeholderTextColor={Colors.textMuted}
                      maxLength={32}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Text style={styles.inputLabel}>Secret (optionnel)</Text>
                      <TouchableOpacity onPress={() => setShowSecret(!showSecret)}>
                        <Lock size={14} color={showSecret ? Colors.accent : Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      value={channelSecret}
                      onChangeText={setChannelSecret}
                      placeholder={selectedChannel === 0 ? "public (pas de secret)" : "secret-partage"}
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showSecret}
                      maxLength={32}
                    />
                    <Text style={styles.inputHint}>
                      Max 32 caractères. Tous les participants doivent avoir le même secret.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.configBtn, (!connected || configuring) && styles.configBtnDisabled]}
                    onPress={handleConfigureChannel}
                    disabled={!connected || configuring}
                  >
                    {configuring ? (
                      <ActivityIndicator size="small" color={Colors.black} />
                    ) : (
                      <>
                        <Lock size={16} color={Colors.black} />
                        <Text style={styles.configBtnText}>Configurer Canal</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.radioSection}>
                {/* Fréquence Actuelle */}
                <View style={styles.freqCard}>
                  <Text style={styles.sectionTitle}>Fréquence Actuelle</Text>
                  <View style={styles.freqDisplay}>
                    <Wifi size={32} color={Colors.accent} />
                    <View style={styles.freqInfo}>
                      <Text style={styles.freqValue}>
                        {deviceInfo ? formatFreq(deviceInfo.radioFreqHz) : '--'}
                      </Text>
                      <Text style={styles.freqSub}>
                        {deviceInfo ? `SF${deviceInfo.radioSf} / ${deviceInfo.radioBwHz / 1000} kHz` : ''}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.infoBox}>
                    <Info size={16} color={Colors.blue} />
                    <Text style={styles.infoText}>
                      La fréquence radio est configurée dans le firmware du device MeshCore. 
                      Pour la changer, reflashez l'ESP32 avec la fréquence désirée.
                    </Text>
                  </View>
                </View>

                {/* Préréglages */}
                <Text style={styles.sectionTitle}>Préréglages Régionaux</Text>
                <Text style={styles.presetsDesc}>
                  Ces fréquences sont pour référence. Vérifiez que votre firmware utilise la même.
                </Text>

                {FREQUENCY_PRESETS.map((preset) => (
                  <View key={preset.name} style={styles.presetCard}>
                    <View style={styles.presetHeader}>
                      <Radio size={16} color={Colors.accent} />
                      <Text style={styles.presetName}>{preset.name}</Text>
                      {deviceInfo && Math.abs(deviceInfo.radioFreqHz - preset.freq) < 1000000 && (
                        <View style={styles.matchBadge}>
                          <Text style={styles.matchBadgeText}>ACTIF</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.presetDetails}>
                      <Text style={styles.presetDetail}>Fréq: {formatFreq(preset.freq)}</Text>
                      <Text style={styles.presetDetail}>SF: {preset.sf}</Text>
                      <Text style={styles.presetDetail}>BW: {preset.bw / 1000} kHz</Text>
                    </View>
                  </View>
                ))}

                {/* Explications */}
                <View style={styles.explainCard}>
                  <AlertCircle size={18} color={Colors.yellow} />
                  <Text style={styles.explainText}>
                    <Text style={styles.explainBold}>Important:</Text> Tous les devices MeshCore 
                    doivent utiliser la même fréquence, SF et BW pour communiquer. Le canal logique 
                    (0-7) est une séparation logicielle au-dessus de la couche radio.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.accentGlow,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  // Canal Section
  currentChannelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currentChannelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.accentGlow,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  currentChannelEmoji: {
    fontSize: 24,
  },
  currentChannelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  currentChannelStatus: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  channelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  channelOption: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  channelOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentGlow,
  },
  channelOptionActive: {
    borderColor: Colors.green,
  },
  channelEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  activeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.green,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: Colors.black,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  configSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  configDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
  },
  inputHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  configBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.blue,
    paddingVertical: 14,
    borderRadius: 10,
  },
  configBtnDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  configBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  // Radio Section
  freqCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  freqDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.accentGlow,
    padding: 20,
    borderRadius: 10,
    marginBottom: 16,
  },
  freqInfo: {
    flex: 1,
  },
  freqValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.accent,
    fontFamily: 'monospace',
  },
  freqSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.blueDim,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.blue + '40',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  presetsDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  presetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  presetName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  matchBadge: {
    backgroundColor: Colors.greenDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.green + '40',
  },
  matchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.green,
  },
  presetDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  presetDetail: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  explainCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.yellowDim,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.yellow + '40',
    marginTop: 10,
  },
  explainText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  explainBold: {
    fontWeight: '700',
    color: Colors.yellow,
  },
});
