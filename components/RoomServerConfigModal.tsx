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
  Server, 
  X, 
  Users, 
  MessageSquare, 
  RefreshCw,
  Info,
  Check
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useMeshCore } from '@/providers/MeshCoreProvider';
import {
  configureRoomServer,
  getRoomServerStatus,
  getRoomServerPosts,
  rebootRoomServer,
  type RoomServerConfig,
  type RoomServerStatus,
  type RoomServerPost,
} from '@/utils/roomserver';

interface RoomServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function RoomServerConfigModal({ 
  visible, 
  onClose,
}: RoomServerConfigModalProps) {
  const { connected, deviceType, sendRawData } = useMeshCore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RoomServerStatus | null>(null);
  const [posts, setPosts] = useState<RoomServerPost[]>([]);
  const [config, setConfig] = useState<Partial<RoomServerConfig>>({
    name: '',
    maxPeers: 20,
    welcomeMessage: '',
    requireAuth: false,
    maxMessageLength: 500,
    retentionDays: 30,
  });

  useEffect(() => {
    if (visible && connected && deviceType === 'roomserver') {
      loadStatus();
    }
  }, [visible, connected, deviceType]);

  const loadStatus = async () => {
    if (!sendRawData) return;
    setLoading(true);
    
    try {
      // Créer une fonction d'attente de réponse
      const onResponse = async (): Promise<Uint8Array | null> => {
        // TODO: Implémenter la réponse réelle depuis MeshCoreProvider
        return null;
      };
      
      const s = await getRoomServerStatus(sendRawData, onResponse);
      const p = await getRoomServerPosts(sendRawData, onResponse);
      setStatus(s);
      setPosts(p);
    } catch (err) {
      console.error('[RoomServer] Load status error:', err);
    }
    
    setLoading(false);
  };

  const handleSave = async () => {
    if (!sendRawData) {
      Alert.alert('Erreur', 'Pas de connexion Room Server');
      return;
    }
    
    setLoading(true);
    
    try {
      const success = await configureRoomServer(sendRawData, config);
      
      if (success) {
        Alert.alert('Succès', 'Configuration envoyée');
        loadStatus();
      } else {
        Alert.alert('Erreur', 'Échec de la configuration');
      }
    } catch (err) {
      console.error('[RoomServer] Save error:', err);
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
      'Redémarrer le Room Server ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Redémarrer', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await rebootRoomServer(sendRawData);
            setLoading(false);
          }
        },
      ]
    );
  };

  // Affichage si pas connecté ou pas un Room Server
  if (!connected || deviceType !== 'roomserver') {
    return (
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Server size={24} color={Colors.accent} />
                <Text style={styles.title}>Room Server</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.offlineContainer}>
              <Info size={48} color={Colors.textMuted} />
              <Text style={styles.offlineText}>
                {deviceType !== 'roomserver' 
                  ? 'Ce device n\'est pas un Room Server' 
                  : 'Pas de connexion Room Server'}
              </Text>
              <Text style={styles.offlineSubtext}>
                Connectez-vous via USB à un Room Server MeshCore
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
              <Server size={24} color={Colors.accent} />
              <Text style={styles.title}>Room Server</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Colors.accent} />
          ) : (
            <ScrollView style={styles.content}>
              {status && (
                <View style={styles.statusCard}>
                  <View style={styles.statusRow}>
                    <Info size={16} color={Colors.textMuted} />
                    <Text style={styles.statusText}>
                      {status.online ? '🟢 En ligne' : '🔴 Hors ligne'}
                    </Text>
                  </View>
                  <View style={styles.statsGrid}>
                    <StatBox icon={Users} label="Pairs" value={status.connectedPeers} />
                    <StatBox icon={MessageSquare} label="Messages" value={status.totalMessages} />
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Configuration</Text>
              
              <Input
                label="Nom du Room Server"
                value={config.name}
                onChangeText={(t: string) => setConfig({ ...config, name: t })}
                placeholder="Mon Forum"
              />

              <Input
                label="Message de bienvenue"
                value={config.welcomeMessage}
                onChangeText={(t: string) => setConfig({ ...config, welcomeMessage: t })}
                placeholder="Bienvenue sur le forum !"
                multiline
              />

              <View style={styles.row}>
                <Input
                  label="Max pairs"
                  value={config.maxPeers?.toString()}
                  onChangeText={(t: string) => setConfig({ ...config, maxPeers: parseInt(t) || 20 })}
                  keyboardType="number-pad"
                  style={styles.halfInput}
                />
                <Input
                  label="Rétention (jours)"
                  value={config.retentionDays?.toString()}
                  onChangeText={(t: string) => setConfig({ ...config, retentionDays: parseInt(t) || 30 })}
                  keyboardType="number-pad"
                  style={styles.halfInput}
                />
              </View>

              <Text style={styles.sectionTitle}>Posts récents ({posts.length})</Text>
              
              {posts.slice(0, 5).map((post) => (
                <View key={post.id} style={styles.postCard}>
                  <Text style={styles.postAuthor}>{post.author.slice(0, 16)}...</Text>
                  <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>
                </View>
              ))}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Check size={18} color={Colors.black} />
                  <Text style={styles.saveText}>Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.rebootBtn} onPress={handleReboot}>
                  <RefreshCw size={18} color={Colors.yellow} />
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

function StatBox({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Icon size={20} color={Colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
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
    color: Colors.text,
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
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
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
  postCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  postAuthor: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
    marginBottom: 4,
  },
  postContent: {
    fontSize: 14,
    color: Colors.text,
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
    backgroundColor: Colors.accent,
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
    borderColor: Colors.yellow,
  },
  rebootText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.yellow,
  },
});
