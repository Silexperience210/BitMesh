import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Radio, Plus, Wifi, Globe, Hash, User, X, Lock, Search } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatTime } from '@/utils/helpers';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import { useMessages } from '@/providers/MessagesProvider';
import type { StoredConversation } from '@/utils/messages-store';

function SignalDots({ strength }: { strength: number }) {
  const bars = strength >= 70 ? 3 : strength >= 40 ? 2 : 1;
  const color = strength >= 70 ? Colors.green : strength >= 40 ? Colors.yellow : Colors.red;
  return (
    <View style={styles.signalDots}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.signalDot,
            { backgroundColor: i <= bars ? color : Colors.surfaceHighlight, height: 4 + i * 3 },
          ]}
        />
      ))}
    </View>
  );
}

function ConvItem({ conv, onPress }: { conv: StoredConversation; onPress: () => void }) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();

  const avatar = conv.isForum ? '#' : conv.name.charAt(0).toUpperCase();
  const avatarBg = conv.isForum ? Colors.cyanDim : Colors.surfaceLight;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.chatItem}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }, conv.online && styles.avatarOnline]}>
            <Text style={styles.avatarText}>{avatar}</Text>
          </View>
          {conv.online && <View style={styles.onlineDot} />}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <View style={styles.chatNameRow}>
              <Text style={styles.chatName} numberOfLines={1}>{conv.name}</Text>
              {conv.isForum ? (
                <View style={styles.forumBadge}>
                  <Hash size={8} color={Colors.cyan} />
                  <Text style={[styles.meshBadgeText, { color: Colors.cyan }]}>forum</Text>
                </View>
              ) : (
                <View style={styles.meshBadge}>
                  <Lock size={8} color={Colors.accent} />
                  <Text style={styles.meshBadgeText}>E2E</Text>
                </View>
              )}
            </View>
            <Text style={styles.chatTime}>
              {conv.lastMessageTime > 0 ? formatTime(conv.lastMessageTime) : ''}
            </Text>
          </View>

          <View style={styles.chatFooter}>
            <Text style={styles.chatLastMessage} numberOfLines={1}>
              {conv.lastMessage || 'Nouvelle conversation'}
            </Text>
            <View style={styles.chatMeta}>
              <SignalDots strength={conv.online ? 85 : 20} />
              {conv.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{conv.unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Valider le nom de forum (caractères MQTT autorisés)
function validateForumName(name: string): string | null {
  if (!name.trim()) return 'Entrez un nom de forum';
  if (name.length > 64) return 'Nom trop long (max 64 caractères)';
  if (/[#$+]/.test(name)) return 'Caractères interdits: # $ +';
  return null;
}

// Modal pour nouvelle conversation ou rejoindre un forum
function NewChatModal({ visible, onClose, onDM, onForum, mqttState }: {
  visible: boolean;
  onClose: () => void;
  onDM: (nodeId: string, name: string) => void;
  onForum: (channelName: string) => Promise<void>;
  mqttState: 'disconnected' | 'connecting' | 'connected' | 'error';
}) {
  const { discoveredForums, announceForumPublic, joinForum: joinForumContext } = useMessages();
  const [tab, setTab] = useState<'dm' | 'forum' | 'discover'>('dm');
  const [nodeId, setNodeId] = useState('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('');
  const [newForumName, setNewForumName] = useState('');
  const [newForumDesc, setNewForumDesc] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDM = () => {
    if (!nodeId.trim()) return;
    onDM(nodeId.trim().toUpperCase(), name.trim() || nodeId.trim());
    setNodeId(''); setName('');
    onClose();
  };

  // FIX: handleForum est maintenant async et attend la fin avant de fermer
  const handleForum = async () => {
    if (!channel.trim()) return;
    const channelName = channel.trim().toLowerCase().replace(/\s+/g, '-');
    const error = validateForumName(channelName);
    if (error) {
      Alert.alert('Nom invalide', error);
      return;
    }
    try {
      setLoading(true);
      await onForum(channelName);
      setChannel('');
      onClose();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de rejoindre le forum. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePublicForum = async () => {
    const error = validateForumName(newForumName);
    if (error) {
      Alert.alert('Nom invalide', error);
      return;
    }

    if (mqttState !== 'connected') {
      Alert.alert(
        'Non connecté',
        `La messagerie n'est pas encore connectée (status: ${mqttState}). Veuillez patienter quelques secondes et réessayer.`
      );
      return;
    }

    const channelName = newForumName.toLowerCase().replace(/\s+/g, '-');
    try {
      setLoading(true);
      await joinForumContext(channelName, newForumDesc || `Forum ${newForumName}`);
      const announced = announceForumPublic(channelName, newForumDesc || `Forum ${newForumName}`);
      if (announced) {
        Alert.alert('Forum créé!', `"#${channelName}" a été créé et annoncé sur le réseau.`);
      } else {
        Alert.alert(
          'Forum créé localement',
          `"#${channelName}" a été créé. Il ne sera annoncé sur le réseau qu'une fois connecté au MQTT.`
        );
      }
      setNewForumName(''); setNewForumDesc(''); setShowCreateForm(false);
      onForum(channelName);
    } catch (err) {
      console.log('[Forum] Erreur création:', err);
      Alert.alert('Erreur', `Impossible de créer le forum: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDiscoveredForum = async (channelName: string, description: string) => {
    try {
      setLoading(true);
      await joinForumContext(channelName, description);
      Alert.alert('Rejoint!', `Vous avez rejoint #${channelName}`);
      onClose();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de rejoindre ce forum.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nouvelle conversation</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'dm' && styles.tabActive]}
              onPress={() => setTab('dm')}
            >
              <User size={14} color={tab === 'dm' ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.tabText, tab === 'dm' && { color: Colors.accent }]}>DM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'forum' && styles.tabActive]}
              onPress={() => setTab('forum')}
            >
              <Hash size={14} color={tab === 'forum' ? Colors.cyan : Colors.textMuted} />
              <Text style={[styles.tabText, tab === 'forum' && { color: Colors.cyan }]}>Forum</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'discover' && styles.tabActive]}
              onPress={() => setTab('discover')}
            >
              <Search size={14} color={tab === 'discover' ? Colors.green : Colors.textMuted} />
              <Text style={[styles.tabText, tab === 'discover' && { color: Colors.green }]}>Découvrir</Text>
            </TouchableOpacity>
          </View>

          {tab === 'dm' ? (
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Node ID du destinataire</Text>
              <TextInput
                style={styles.modalInput}
                value={nodeId}
                onChangeText={setNodeId}
                placeholder="MESH-XXXX"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
              <Text style={styles.inputLabel}>Nom (optionnel)</Text>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder="Alice"
                placeholderTextColor={Colors.textMuted}
              />
              <Text style={styles.inputHint}>
                Le message sera chiffré E2E avec la clé publique du destinataire
              </Text>
              <TouchableOpacity style={styles.modalBtn} onPress={handleDM}>
                <Lock size={14} color={Colors.black} />
                <Text style={styles.modalBtnText}>Démarrer DM chiffré</Text>
              </TouchableOpacity>
            </View>
          ) : tab === 'forum' ? (
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nom du canal</Text>
              <TextInput
                style={styles.modalInput}
                value={channel}
                onChangeText={setChannel}
                placeholder="bitcoin-paris"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
              />
              <Text style={styles.inputHint}>
                Tout le monde connaissant ce nom peut rejoindre le forum.
                Les messages sont chiffrés avec SHA256(&quot;forum:&quot;+nom).
              </Text>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.cyan, opacity: loading ? 0.6 : 1 }]}
                onPress={handleForum}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.black} />
                ) : (
                  <>
                    <Hash size={14} color={Colors.black} />
                    <Text style={styles.modalBtnText}>Rejoindre le forum</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalBody}>
              <TouchableOpacity
                style={styles.createForumBtn}
                onPress={() => setShowCreateForm(!showCreateForm)}
                activeOpacity={0.7}
              >
                <Plus size={16} color={Colors.green} />
                <Text style={[styles.tabText, { color: Colors.green }]}>
                  {showCreateForm ? 'Annuler' : 'Créer un forum public'}
                </Text>
              </TouchableOpacity>

              {showCreateForm && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Nom du forum (ex: bitcoin-paris)"
                    placeholderTextColor={Colors.textMuted}
                    value={newForumName}
                    onChangeText={setNewForumName}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Description (optionnel)"
                    placeholderTextColor={Colors.textMuted}
                    value={newForumDesc}
                    onChangeText={setNewForumDesc}
                  />
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: Colors.green, opacity: loading ? 0.6 : 1 }]}
                    onPress={handleCreatePublicForum}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={Colors.black} />
                    ) : (
                      <Text style={styles.modalBtnText}>Créer et Annoncer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <Text style={[styles.inputLabel, { marginTop: 16 }]}>
                Forums découverts ({discoveredForums.length})
              </Text>

              {discoveredForums.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Search size={32} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 8 }}>
                    Aucun forum découvert
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={discoveredForums}
                  keyExtractor={(item, idx) => `${item.channelName}-${idx}`}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.discoveredForumItem}
                      onPress={() => handleJoinDiscoveredForum(item.channelName, item.description)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.forumIconSmall}>
                        <Hash size={16} color={Colors.green} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.discoveredForumName}>#{item.channelName}</Text>
                        <Text style={styles.discoveredForumDesc} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Text style={styles.discoveredForumMeta}>
                          Par {item.creatorNodeId}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const { settings, isInternetMode, isLoRaMode } = useAppSettings();
  const { conversations, mqttState, identity, startConversation, joinForum } = useMessages();
  const [modalVisible, setModalVisible] = useState(false);

  const modeLabel = settings.connectionMode === 'internet' ? 'Internet Mode'
    : settings.connectionMode === 'bridge' ? 'Bridge Mode' : 'LoRa Mesh';
  const modeColor = settings.connectionMode === 'internet' ? Colors.blue
    : settings.connectionMode === 'bridge' ? Colors.cyan : Colors.green;
  const ModeIcon = settings.connectionMode === 'internet' ? Globe
    : settings.connectionMode === 'bridge' ? Wifi : Radio;

  const mqttDot = mqttState === 'connected' ? Colors.green
    : mqttState === 'connecting' ? Colors.yellow : Colors.red;

  const renderConv = useCallback(
    ({ item }: { item: StoredConversation }) => (
      <ConvItem
        conv={item}
        onPress={() => router.push(`/(messages)/${encodeURIComponent(item.id)}` as never)}
      />
    ),
    [router]
  );

  const handleDM = async (nodeId: string, name: string) => {
    await startConversation(nodeId, name);
    router.push(`/(messages)/${encodeURIComponent(nodeId)}` as never);
  };

  const handleForum = async (channelName: string): Promise<void> => {
    await joinForum(channelName);
    router.push(`/(messages)/${encodeURIComponent('forum:' + channelName)}` as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.mqttDot, { backgroundColor: mqttDot }]} />
          <ModeIcon size={14} color={modeColor} />
          <Text style={[styles.statusText, { color: modeColor }]}>{modeLabel}</Text>
          <View style={styles.statusDivider} />
          <Text style={styles.statusNodes}>
            {identity ? identity.nodeId : 'No wallet'}
          </Text>
        </View>
        <Text style={styles.statusFreq}>
          {mqttState === 'connected' ? 'MQTT ●' : mqttState === 'connecting' ? 'MQTT...' : 'MQTT ○'}
        </Text>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConv}
        contentContainerStyle={[styles.listContent, conversations.length === 0 && styles.emptyList]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Radio size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Aucune conversation</Text>
            <Text style={styles.emptySubtitle}>
              {identity
                ? `Votre NodeID: ${identity.nodeId}\nPartagez-le pour recevoir des messages.`
                : 'Créez un wallet pour commencer à communiquer.'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => setModalVisible(true)}>
        <Plus size={24} color={Colors.black} />
      </TouchableOpacity>

      <NewChatModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onDM={handleDM}
        onForum={handleForum}
        mqttState={mqttState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mqttDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusDivider: { width: 1, height: 12, backgroundColor: Colors.border, marginHorizontal: 4 },
  statusNodes: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'monospace' },
  statusFreq: { color: Colors.textMuted, fontSize: 11, fontFamily: 'monospace' },
  listContent: { paddingTop: 4, paddingBottom: 100 },
  emptyList: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatarContainer: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  avatarOnline: { borderColor: Colors.green },
  avatarText: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.green, borderWidth: 2, borderColor: Colors.background,
  },
  chatContent: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  chatName: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  meshBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.accentGlow, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  forumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.cyanDim, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  meshBadgeText: { color: Colors.accent, fontSize: 9, fontWeight: '700' },
  chatTime: { color: Colors.textMuted, fontSize: 12 },
  chatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatLastMessage: { color: Colors.textSecondary, fontSize: 14, flex: 1, marginRight: 8 },
  chatMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalDots: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signalDot: { width: 3, borderRadius: 1.5 },
  unreadBadge: {
    backgroundColor: Colors.accent, minWidth: 20, height: 20,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: Colors.black, fontSize: 11, fontWeight: '700' },
  separator: { height: 0.5, backgroundColor: Colors.border, marginLeft: 80 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  tabRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, gap: 8 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surfaceLight,
  },
  tabActive: { backgroundColor: Colors.surfaceHighlight },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  modalBody: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  inputLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 4 },
  modalInput: {
    backgroundColor: Colors.surfaceLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.text, fontSize: 15, borderWidth: 0.5, borderColor: Colors.border, fontFamily: 'monospace',
  },
  inputHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  modalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, marginTop: 8,
  },
  modalBtnText: { color: Colors.black, fontSize: 15, fontWeight: '700' },
  // Forum discovery
  createForumBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border,
  },
  discoveredForumItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceLight, borderRadius: 10,
    padding: 12, marginTop: 8, borderWidth: 0.5, borderColor: Colors.border,
  },
  forumIconSmall: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  discoveredForumName: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  discoveredForumDesc: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  discoveredForumMeta: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
});
