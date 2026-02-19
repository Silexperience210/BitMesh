import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { 
  Radio, 
  X, 
  Signal,
  Activity,
  RefreshCw,
  Info,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useMeshCore } from '@/providers/MeshCoreProvider';
import {
  configureRepeater,
  getRepeaterStatus,
  getRepeaterNeighbors,
  rebootRepeater,
  type RepeaterConfig,
  type RepeaterStatus,
  type RepeaterNeighbor,
} from '@/utils/repeater';

interface RepeaterConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function RepeaterConfigModal({ 
  visible, 
  onClose,
}: RepeaterConfigModalProps) {
  const { connected, deviceType, sendRawData } = useMeshCore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepeaterStatus | null>(null);
  const [neighbors, setNeighbors] = useState<RepeaterNeighbor[]>([]);
  const [config, setConfig] = useState<Partial<RepeaterConfig>>({
    name: '',
    maxHops: 5,
    forwardDirectOnly: false,
    filterByPath: true,
    minRssi: -100,
    transportCode: '',
    bridgeMode: false,
  });

  useEffect(() => {
    if (visible && connected && deviceType === 'repeater') {
      loadData();
    }
  }, [visible, connected, deviceType]);

  const loadData = async () => {
    if (!sendRawData) return;
    setLoading(true);
    
    try {
      const onResponse = async (): Promise<Uint8Array | null> => null;
      
      const s = await getRepeaterStatus(sendRawData, onResponse);
      const n = await getRepeaterNeighbors(sendRawData, onResponse);
      setStatus(s);
      setNeighbors(n);
    } catch (err) {
      console.error('[Repeater] Load data error:', err);
    }
    
    setLoading(false);
  };

  const handleSave = async () => {
    if (!sendRawData) {
      Alert.alert('Erreur', 'Pas de connexion Repeater');
      return;
    }
    
    setLoading(true);
    
    try {
      const success = await configureRepeater(sendRawData, config);
      
      if (success) {
        Alert.alert('Succès', 'Configuration envoyée');
      } else {
        Alert.alert('Erreur', 'Échec de la configuration');
      }
    } catch (err) {
      console.error('[Repeater] Save error:', err);
      Alert.alert('Erreur', 'Échec de la configuration');
    }
    
    setLoading(false);
  };

  const handleReboot = async () => {
    if (!sendRawData) {
      Alert.alert('Erreur', 'Pas de connexion');
      return;
    }
    
    Alert.alert(
      'Redémarrer',
      'Redémarrer le Repeater ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Redémarrer', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await rebootRepeater(sendRawData);
            setLoading(false);
          }
        },
      ]
    );
  };

  if (!connected || deviceType !== 'repeater') {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Radio size={24} color={Colors.cyan} />
                <Text style={styles.title}>Repeater</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.offlineContainer}>
              <Info size={48} color={Colors.textMuted} />
              <Text style={styles.offlineText}>
                {deviceType !== 'repeater' 
                  ? 'Ce device n\'est pas un Repeater' 
                  : 'Pas de connexion Repeater'}
              </Text>
              <Text style={styles.offlineSubtext}>
                Connectez-vous via USB à un Repeater MeshCore
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Radio size={24} color={Colors.cyan} />
              <Text style={styles.title}>Repeater</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Colors.cyan} />
          ) : (
            <ScrollView style={styles.content}>
              {status && (
                <View style={styles.statusCard}>
                  <View style={styles.statusRow}>
                    <Signal size={16} color={status.online ? Colors.green : Colors.red} />
                    <Text style={[styles.statusText, { color: status.online ? Colors.green : Colors.red }]}>
                      {status.online ? '🟢 En ligne' : '🔴 Hors ligne'}
                    </Text>
                  </View>
                  
                  <View style={styles.statsGrid}>
                    <StatBox icon={Activity} label="Relayés" value={status.packetsRelayed} color={Colors.green} />
                    <StatBox icon={X} label="Drop" value={status.packetsDropped} color={Colors.red} />
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Configuration</Text>
              
              <Input
                label="Nom du repeater"
                value={config.name}
                onChangeText={(t: string) => setConfig({ ...config, name: t })}
                placeholder="Repeater-01"
              />

              <View style={styles.row}>
                <Input
                  label="Max hops"
                  value={config.maxHops?.toString()}
                  onChangeText={(t: string) => setConfig({ ...config, maxHops: parseInt(t) || 5 })}
                  keyboardType="number-pad"
                  style={styles.halfInput}
                />
                <Input
                  label="Min RSSI"
                  value={config.minRssi?.toString()}
                  onChangeText={(t: string) => setConfig({ ...config, minRssi: parseInt(t) || -100 })}
                  keyboardType="number-pad"
                  style={styles.halfInput}
                />
              </View>

              <Text style={styles.sectionTitle}>Voisins ({neighbors.length})</Text>
              
              {neighbors.slice(0, 10).map((neighbor, idx) => (
                <View key={idx} style={styles.neighborCard}>
                  <View style={styles.neighborHeader}>
                    <Text style={styles.neighborId}>{neighbor.nodeId.slice(0, 16)}...</Text>
                    <View style={[styles.rssiBadge, { 
                      backgroundColor: neighbor.rssi > -80 ? `${Colors.green}20` : `${Colors.yellow}20`
                    }]}>
                      <Text style={[styles.rssiText, { 
                        color: neighbor.rssi > -80 ? Colors.green : Colors.yellow 
                      }]}>
                        {neighbor.rssi} dBm
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <RefreshCw size={18} color={Colors.black} />
                  <Text style={styles.saveText}>Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.rebootBtn} onPress={handleReboot}>
                  <RefreshCw size={18} color={Colors.cyan} />
                  <Text style={styles.rebootText}>Redémarrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Icon size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Input({ label, style, ...props }: { label: string; style?: any } & any) {
  return (
    <View style={[styles.inputContainer, style]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={Colors.textMuted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
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
  offlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  offlineText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  offlineSubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  content: {
    maxHeight: 600,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  neighborCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  neighborHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  neighborId: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },
  rssiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rssiText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.cyan,
    padding: 14,
    borderRadius: 10,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  rebootBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cyan,
  },
  rebootText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.cyan,
  },
});
