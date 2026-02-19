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
  Users,
  RefreshCw,
  Power,
  BarChart3,
  Settings2
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  configureRepeater,
  getRepeaterStatus,
  getRepeaterNeighbors,
  getRepeaterStats,
  resetRepeaterStats,
  rebootRepeater,
  type RepeaterConfig,
  type RepeaterStatus,
  type RepeaterNeighbor,
  type RepeaterStats,
} from '@/utils/repeater';

interface RepeaterConfigModalProps {
  visible: boolean;
  onClose: () => void;
  deviceId: number;
}

export default function RepeaterConfigModal({ 
  visible, 
  onClose, 
  deviceId 
}: RepeaterConfigModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepeaterStatus | null>(null);
  const [neighbors, setNeighbors] = useState<RepeaterNeighbor[]>([]);
  const [stats, setStats] = useState<RepeaterStats | null>(null);
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
    if (visible && deviceId) {
      loadData();
    }
  }, [visible, deviceId]);

  const loadData = async () => {
    setLoading(true);
    const [s, n, st] = await Promise.all([
      getRepeaterStatus(deviceId),
      getRepeaterNeighbors(deviceId),
      getRepeaterStats(deviceId),
    ]);
    setStatus(s);
    setNeighbors(n);
    setStats(st);
    setLoading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    const success = await configureRepeater(deviceId, config);
    setLoading(false);
    
    if (success) {
      Alert.alert('Succès', 'Configuration appliquée');
      loadData();
    } else {
      Alert.alert('Erreur', 'Échec de la configuration');
    }
  };

  const handleResetStats = async () => {
    await resetRepeaterStats(deviceId);
    loadData();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
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
              {/* Status */}
              {status && (
                <View style={styles.statusCard}>
                  <View style={styles.statusRow}>
                    <Signal size={16} color={status.online ? Colors.green : Colors.red} />
                    <Text style={[styles.statusText, { color: status.online ? Colors.green : Colors.red }]}>
                      {status.online ? '🟢 En ligne' : '🔴 Hors ligne'}
                    </Text>
                  </View>
                  
                  <View style={styles.statsGrid}>
                    <StatBox 
                      icon={Activity} 
                      label="Relayés" 
                      value={status.packetsRelayed}
                      color={Colors.green}
                    />
                    <StatBox 
                      icon={X} 
                      label="Drop" 
                      value={status.packetsDropped}
                      color={Colors.red}
                    />
                    <StatBox 
                      icon={Signal} 
                      label="RSSI" 
                      value={status.averageRssi}
                      color={Colors.cyan}
                      suffix="dBm"
                    />
                  </View>
                </View>
              )}

              {/* Configuration */}
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

              <Input
                label="Code transport (zoning)"
                value={config.transportCode}
                onChangeText={(t: string) => setConfig({ ...config, transportCode: t })}
                placeholder="ZONE_A"
              />

              {/* Toggle options */}
              <Toggle
                label="Forward direct only"
                value={config.forwardDirectOnly || false}
                onChange={(v) => setConfig({ ...config, forwardDirectOnly: v })}
              />

              <Toggle
                label="Filter by path quality"
                value={config.filterByPath || false}
                onChange={(v) => setConfig({ ...config, filterByPath: v })}
              />

              <Toggle
                label="Bridge mode"
                value={config.bridgeMode || false}
                onChange={(v) => setConfig({ ...config, bridgeMode: v })}
              />

              {/* Voisins */}
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
                  <Text style={styles.neighborMeta}>
                    {neighbor.hops} hop{neighbor.hops > 1 ? 's' : ''} • {Math.floor((Date.now() - neighbor.lastSeen) / 1000)}s
                  </Text>
                </View>
              ))}

              {/* Stats */}
              {stats && (
                <>
                  <Text style={styles.sectionTitle}>Statistiques 24h</Text>
                  <View style={styles.chartPlaceholder}>
                    <BarChart3 size={40} color={Colors.textMuted} />
                    <Text style={styles.chartText}>
                      Total: {stats.totalRelayed} relayés, {stats.totalDropped} drop
                    </Text>
                  </View>
                  
                  <TouchableOpacity style={styles.resetBtn} onPress={handleResetStats}>
                    <Text style={styles.resetText}>Reset stats</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Settings2 size={18} color={Colors.black} />
                  <Text style={styles.saveText}>Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.rebootBtn} onPress={() => rebootRepeater(deviceId)}>
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

function StatBox({ icon: Icon, label, value, color, suffix = '' }: { 
  icon: any; 
  label: string; 
  value: number; 
  color: string;
  suffix?: string;
}) {
  return (
    <View style={styles.statBox}>
      <Icon size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}{suffix}</Text>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity style={styles.toggle} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleBox, value && styles.toggleBoxActive]}>
        <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
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
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  toggleBox: {
    width: 48,
    height: 26,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 13,
    padding: 2,
  },
  toggleBoxActive: {
    backgroundColor: Colors.cyan,
  },
  toggleDot: {
    width: 22,
    height: 22,
    backgroundColor: Colors.textMuted,
    borderRadius: 11,
  },
  toggleDotActive: {
    backgroundColor: Colors.background,
    transform: [{ translateX: 22 }],
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
    marginBottom: 4,
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
  neighborMeta: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  chartPlaceholder: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  chartText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 8,
  },
  resetBtn: {
    alignSelf: 'center',
    padding: 8,
  },
  resetText: {
    fontSize: 13,
    color: Colors.textMuted,
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
