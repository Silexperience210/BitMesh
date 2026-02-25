import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Radio,
  Wifi,
  MapPin,
  Activity,
  Cpu,
  ScanSearch,
  X,
  Check,
  Server,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  Usb,
  UserPlus,
  UserCheck,
  MessageCircle,
  Star,
  Send,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { meshStats } from '@/mocks/data';
import { type BleDeviceInfo } from '../../../utils/ble-gateway';
import { useMessages } from '@/providers/MessagesProvider';
import { useRouter } from 'expo-router';
import { type RadarPeer, formatDistance } from '@/utils/radar';
import { useGateway } from '@/providers/GatewayProvider';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import { formatTime } from '@/utils/helpers';
import MeshRadar from '@/components/MeshRadar';
import GatewayScanModal from '@/components/GatewayScanModal';
import UsbSerialScanModal from '@/components/UsbSerialScanModal';
import RoomServerConfigModal from '@/components/RoomServerConfigModal';
import RepeaterConfigModal from '@/components/RepeaterConfigModal';
import { useBle } from '@/providers/BleProvider';
import { useUsbSerial } from '@/providers/UsbSerialProvider';

type ViewMode = 'radar' | 'list';
type FilterMode = 'all' | 'online';

function formatFreq(hz: number): string {
  return hz >= 1_000_000 ? `${(hz / 1_000_000).toFixed(1)} MHz` : `${hz} Hz`;
}

function formatBw(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

function ScanButton({ isScanning, onPress }: { isScanning: boolean; onPress: () => void }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      ).start();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isScanning, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity
      style={[styles.scanButton, isScanning && styles.scanButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
      testID="scan-button"
    >
      <Animated.View style={{ transform: [{ rotate: isScanning ? rotation : '0deg' }] }}>
        <ScanSearch size={18} color={isScanning ? Colors.black : Colors.accent} />
      </Animated.View>
      <Text style={[styles.scanButtonText, isScanning && styles.scanButtonTextActive]}>
        {isScanning ? 'Scanning...' : 'Scan'}
      </Text>
    </TouchableOpacity>
  );
}


function StatsRow({ peers, mqttConnected, deviceInfo }: { peers: RadarPeer[]; mqttConnected: boolean; deviceInfo: BleDeviceInfo | null }) {
  const onlineCount = peers.filter(p => p.online).length;
  const freqLabel = deviceInfo ? formatFreq(deviceInfo.radioFreqHz) : '--';

  return (
    <View style={styles.statsRow}>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.green }]} />
        <Text style={styles.statChipValue}>{onlineCount}</Text>
        <Text style={styles.statChipLabel}>En ligne</Text>
      </View>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.accent }]} />
        <Text style={styles.statChipValue}>{peers.length}</Text>
        <Text style={styles.statChipLabel}>Pairs</Text>
      </View>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: mqttConnected ? Colors.green : Colors.red }]} />
        <Text style={[styles.statChipValue, { color: mqttConnected ? Colors.green : Colors.red }]}>
          {mqttConnected ? 'OK' : 'OFF'}
        </Text>
        <Text style={styles.statChipLabel}>MQTT</Text>
      </View>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.textMuted }]} />
        <Text style={styles.statChipValue}>{freqLabel}</Text>
        <Text style={styles.statChipLabel}>Freq</Text>
      </View>
    </View>
  );
}

function RadioBand({ deviceInfo }: { deviceInfo: BleDeviceInfo | null }) {
  // Utilise les vraies valeurs du device, ou "--" si pas encore reçu
  const freq = deviceInfo ? formatFreq(deviceInfo.radioFreqHz) : '--';
  const sf   = deviceInfo ? `SF${deviceInfo.radioSf}` : '--';
  const bw   = deviceInfo ? formatBw(deviceInfo.radioBwHz) : '--';
  const tx   = deviceInfo ? `${deviceInfo.txPower} dBm` : '--';
  const cr   = deviceInfo ? `4/${deviceInfo.radioCr}` : '--'; // Coding Rate: 4/5, 4/6, 4/7, 4/8

  return (
    <View style={styles.radioBand}>
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>FREQ</Text>
        <Text style={[styles.radioValue, !deviceInfo && styles.radioValuePlaceholder]}>{freq}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>SF</Text>
        <Text style={[styles.radioValue, !deviceInfo && styles.radioValuePlaceholder]}>{sf}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>BW</Text>
        <Text style={[styles.radioValue, !deviceInfo && styles.radioValuePlaceholder]}>{bw}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>CR</Text>
        <Text style={[styles.radioValue, !deviceInfo && styles.radioValuePlaceholder]}>{cr}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>TX</Text>
        <Text style={[styles.radioValue, !deviceInfo && styles.radioValuePlaceholder]}>{tx}</Text>
      </View>
    </View>
  );
}

function FilterChips({ active, onChange }: { active: FilterMode; onChange: (f: FilterMode) => void }) {
  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'online', label: 'En ligne' },
  ];

  return (
    <View style={styles.filterRow}>
      {filters.map((f) => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterChip, active === f.key && styles.filterChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(f.key);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterChipText, active === f.key && styles.filterChipTextActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NodeDetailModal({ peer, visible, onClose }: { peer: RadarPeer | null; visible: boolean; onClose: () => void }) {
  const { addContact, removeContact, isContact: isContactFn, startConversation } = useMessages();
  const router = useRouter();
  const [alreadyContact, setAlreadyContact] = React.useState(false);
  const [contactLoading, setContactLoading] = React.useState(false);

  React.useEffect(() => {
    if (visible && peer) {
      isContactFn(peer.nodeId).then(setAlreadyContact);
    }
  }, [visible, peer?.nodeId]);

  if (!peer) return null;

  const handleToggleContact = async () => {
    setContactLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (alreadyContact) {
        await removeContact(peer.nodeId);
        setAlreadyContact(false);
      } else {
        await addContact(peer.nodeId, peer.name, peer.pubkeyHex);
        setAlreadyContact(true);
      }
    } finally {
      setContactLoading(false);
    }
  };

  const handleSendDM = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await startConversation(peer.nodeId, peer.name);
    onClose();
    router.push(`/(messages)/${encodeURIComponent(peer.nodeId)}` as never);
  };

  const signalColor = peer.signalStrength > 70 ? Colors.green : peer.signalStrength > 40 ? Colors.accent : Colors.red;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalNodeIcon, { borderColor: peer.online ? Colors.green : Colors.textMuted }]}>
                <Radio size={22} color={peer.online ? Colors.green : Colors.textMuted} />
              </View>
              <View>
                <Text style={styles.modalNodeName}>{peer.name}</Text>
                <Text style={styles.modalNodeId}>{peer.nodeId}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.modalClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalGrid}>
            <View style={styles.modalGridItem}>
              <Wifi size={14} color={signalColor} />
              <Text style={[styles.modalGridValue, { color: signalColor }]}>{peer.signalStrength}%</Text>
              <Text style={styles.modalGridLabel}>Signal</Text>
            </View>
            <View style={styles.modalGridItem}>
              <MapPin size={14} color={Colors.cyan} />
              <Text style={styles.modalGridValue}>{formatDistance(peer.distanceMeters)}</Text>
              <Text style={styles.modalGridLabel}>Distance</Text>
            </View>
            <View style={styles.modalGridItem}>
              <Activity size={14} color={Colors.blue} />
              <Text style={styles.modalGridValue}>{peer.online ? 'ONLINE' : 'OFFLINE'}</Text>
              <Text style={styles.modalGridLabel}>État</Text>
            </View>
          </View>

          <View style={styles.modalDetails}>
            {peer.lat !== undefined && peer.lng !== undefined && (
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Coordonnées GPS</Text>
                <Text style={styles.modalDetailValue}>
                  {peer.lat.toFixed(5)}, {peer.lng.toFixed(5)}
                </Text>
              </View>
            )}
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Node ID</Text>
              <Text style={styles.modalDetailValue}>{peer.nodeId}</Text>
            </View>
            {peer.pubkeyHex && (
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Pubkey</Text>
                <Text style={styles.modalDetailValue} numberOfLines={1}>
                  {peer.pubkeyHex.slice(0, 20)}…
                </Text>
              </View>
            )}
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Vu il y a</Text>
              <Text style={styles.modalDetailValue}>{formatTime(peer.lastSeen)}</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[
                styles.modalActionBtn,
                alreadyContact ? styles.modalActionBtnContact : styles.modalActionBtnAdd,
              ]}
              onPress={handleToggleContact}
              disabled={contactLoading}
              activeOpacity={0.7}
            >
              {contactLoading ? (
                <ActivityIndicator size="small" color={alreadyContact ? Colors.green : Colors.black} />
              ) : alreadyContact ? (
                <>
                  <UserCheck size={16} color={Colors.green} />
                  <Text style={[styles.modalActionBtnText, { color: Colors.green }]}>Contact ajouté</Text>
                </>
              ) : (
                <>
                  <UserPlus size={16} color={Colors.black} />
                  <Text style={styles.modalActionBtnText}>Ajouter</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalActionBtn, styles.modalActionBtnDM]}
              onPress={handleSendDM}
              activeOpacity={0.7}
            >
              <MessageCircle size={16} color={Colors.black} />
              <Text style={styles.modalActionBtnText}>Message DM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NodeItem({ peer, onPress }: { peer: RadarPeer; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const signalColor = peer.signalStrength > 70 ? Colors.green
    : peer.signalStrength > 40 ? Colors.accent
    : Colors.red;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.nodeItem}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        <View style={styles.nodeLeft}>
          <View style={[styles.nodeIcon, { borderColor: peer.online ? Colors.green : Colors.textMuted }]}>
            <Radio size={16} color={peer.online ? Colors.green : Colors.textMuted} />
            {peer.online && (
              <View style={[styles.nodeOnlineDot, { backgroundColor: Colors.green }]} />
            )}
          </View>
          <View style={styles.nodeInfo}>
            <View style={styles.nodeNameRow}>
              <Text style={[styles.nodeName, !peer.online && styles.nodeNameOffline]} numberOfLines={1}>
                {peer.name}
              </Text>
              <View style={[styles.pairingBadge, {
                backgroundColor: peer.online ? Colors.greenDim : Colors.surfaceHighlight,
                borderColor: (peer.online ? Colors.green : Colors.textMuted) + '40',
              }]}>
                <Text style={[styles.pairingBadgeText, { color: peer.online ? Colors.green : Colors.textMuted }]}>
                  {peer.online ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
            <View style={styles.nodeMetaRow}>
              <MapPin size={10} color={Colors.textMuted} />
              <Text style={styles.nodeDistance}>{formatDistance(peer.distanceMeters)}</Text>
              {peer.lat !== undefined && (
                <>
                  <Text style={styles.nodeSep}>·</Text>
                  <Text style={styles.nodeRssi}>GPS</Text>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.nodeRight}>
          <View style={styles.nodeSignalRow}>
            <Wifi size={12} color={signalColor} />
            <Text style={[styles.nodeSignalText, { color: signalColor }]}>
              {peer.signalStrength}%
            </Text>
          </View>
          <Text style={styles.nodeLastSeen}>{formatTime(peer.lastSeen)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function GatewayStatusBanner() {
  const { gatewayState, getUptime } = useGateway();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (gatewayState.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [gatewayState.isActive, pulseAnim]);

  if (!gatewayState.isActive) return null;

  const stats = gatewayState.stats;
  const recentJobs = gatewayState.relayJobs.slice(0, 3);
  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <View style={styles.gwBanner}>
      <Animated.View style={[styles.gwBannerGlow, { opacity: glowOpacity }]} />
      <View style={styles.gwBannerHeader}>
        <View style={styles.gwBannerTitleRow}>
          <Server size={14} color={Colors.green} />
          <Text style={styles.gwBannerTitle}>Gateway Active</Text>
        </View>
        <Text style={styles.gwBannerUptime}>{getUptime()}</Text>
      </View>

      <View style={styles.gwBannerStats}>
        <View style={styles.gwBannerStat}>
          <ArrowUpRight size={11} color={Colors.accent} />
          <Text style={styles.gwBannerStatValue}>{stats.txRelayed}</Text>
          <Text style={styles.gwBannerStatLabel}>TX</Text>
        </View>
        <View style={styles.gwBannerStatDivider} />
        <View style={styles.gwBannerStat}>
          <ArrowDownLeft size={11} color={Colors.cyan} />
          <Text style={[styles.gwBannerStatValue, { color: Colors.cyan }]}>{stats.cashuRelayed}</Text>
          <Text style={styles.gwBannerStatLabel}>Cashu</Text>
        </View>
        <View style={styles.gwBannerStatDivider} />
        <View style={styles.gwBannerStat}>
          <Layers size={11} color={Colors.blue} />
          <Text style={styles.gwBannerStatValue}>{stats.chunksProcessed}</Text>
          <Text style={styles.gwBannerStatLabel}>Chunks</Text>
        </View>
        <View style={styles.gwBannerStatDivider} />
        <View style={styles.gwBannerStat}>
          <Radio size={11} color={Colors.green} />
          <Text style={[styles.gwBannerStatValue, { color: Colors.green }]}>{stats.peersServed}</Text>
          <Text style={styles.gwBannerStatLabel}>Peers</Text>
        </View>
      </View>

      {recentJobs.length > 0 && (
        <View style={styles.gwRecentJobs}>
          {recentJobs.map((job) => {
            const typeColorMap: Record<string, string> = {
              tx_broadcast: Colors.accent,
              cashu_relay: Colors.cyan,
              cashu_redeem: Colors.cyan,
              chunk_reassembly: Colors.blue,
              payment_forward: Colors.purple,
            };
            const color = typeColorMap[job.type] ?? Colors.textMuted;
            return (
              <View key={job.id} style={styles.gwJobRow}>
                <View style={[styles.gwJobDot, { backgroundColor: color }]} />
                <Text style={styles.gwJobText} numberOfLines={1}>{job.payload}</Text>
                <View style={[
                  styles.gwJobStatusDot,
                  { backgroundColor: job.status === 'completed' ? Colors.green : job.status === 'failed' ? Colors.red : Colors.yellow },
                ]} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function InternetModeBanner() {
  const { settings } = useAppSettings();
  const { gatewayState } = useGateway();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  if (settings.connectionMode !== 'internet') return null;

  return (
    <View style={styles.internetBanner}>
      <Animated.View style={[styles.internetBannerGlow, { opacity: glowOpacity }]} />
      <View style={styles.internetBannerHeader}>
        <View style={styles.internetBannerTitleRow}>
          <View style={styles.internetBannerIcon}>
            <Server size={16} color={Colors.blue} />
          </View>
          <View>
            <Text style={styles.internetBannerTitle}>Internet-Only Mode</Text>
            <Text style={styles.internetBannerSubtitle}>No LoRa hardware required</Text>
          </View>
        </View>
        <View style={[styles.internetModeBadge, { backgroundColor: Colors.blueDim }]}>
          <Text style={[styles.internetModeText, { color: Colors.blue }]}>ONLINE</Text>
        </View>
      </View>

      <Text style={styles.internetBannerDesc}>
        Messages are routed through MQTT gateways to reach LoRa mesh peers who have no internet access. Your transactions (Bitcoin, Cashu) are broadcast directly via internet.
      </Text>

      <View style={styles.internetFlowRow}>
        <View style={styles.internetFlowNode}>
          <Text style={styles.internetFlowEmoji}>{'\ud83d\udcf1'}</Text>
          <Text style={styles.internetFlowLabel}>You</Text>
          <Text style={styles.internetFlowSub}>Internet</Text>
        </View>
        <View style={styles.internetFlowArrow}>
          <Text style={styles.internetFlowArrowText}>{'\u2192'} MQTT {'\u2192'}</Text>
        </View>
        <View style={styles.internetFlowNode}>
          <Text style={styles.internetFlowEmoji}>{'\ud83d\udce1'}</Text>
          <Text style={styles.internetFlowLabel}>Gateway</Text>
          <Text style={styles.internetFlowSub}>Bridge</Text>
        </View>
        <View style={styles.internetFlowArrow}>
          <Text style={styles.internetFlowArrowText}>{'\u2192'} LoRa {'\u2192'}</Text>
        </View>
        <View style={styles.internetFlowNode}>
          <Text style={styles.internetFlowEmoji}>{'\ud83c\udfd4\ufe0f'}</Text>
          <Text style={styles.internetFlowLabel}>Peer</Text>
          <Text style={styles.internetFlowSub}>Off-grid</Text>
        </View>
      </View>

      <View style={styles.internetStatsRow}>
        <View style={styles.internetStatItem}>
          <Text style={styles.internetStatValue}>{gatewayState.mqttConnected ? 'Yes' : 'No'}</Text>
          <Text style={styles.internetStatLabel}>MQTT</Text>
        </View>
        <View style={styles.internetStatDivider} />
        <View style={styles.internetStatItem}>
          <Text style={styles.internetStatValue}>{gatewayState.peers.length || 2}</Text>
          <Text style={styles.internetStatLabel}>Gateways</Text>
        </View>
        <View style={styles.internetStatDivider} />
        <View style={styles.internetStatItem}>
          <Text style={[styles.internetStatValue, { color: Colors.green }]}>Direct</Text>
          <Text style={styles.internetStatLabel}>BTC/Cashu</Text>
        </View>
      </View>
    </View>
  );
}

export default function MeshScreen() {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('radar');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedPeer, setSelectedPeer] = useState<RadarPeer | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [showUsbModal, setShowUsbModal] = useState(false);
  const [showRoomServerModal, setShowRoomServerModal] = useState(false);
  const [showRepeaterModal, setShowRepeaterModal] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const { settings } = useAppSettings();
  const isInternetOnly = settings.connectionMode === 'internet';
  const { radarPeers, mqttState, identity, sendMessage } = useMessages();
  const { connected: bleConnected, device: bleDevice, deviceInfo, meshContacts: bleMeshContacts, sendChannelMessage, sendDirectMessage, channelConfigured, currentChannel } = useBle();
  
  // Test message state
  const [testMsg, setTestMsg] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [lastAck, setLastAck] = useState<{ackCode: number, rtt: number} | null>(null);

  // Récupérer onSendConfirmed depuis le contexte BLE
  const { onSendConfirmed } = useBle();

  // Écouter les confirmations d'envoi (ACK)
  useEffect(() => {
    if (!bleConnected || !onSendConfirmed) return;
    
    const unsubscribe = onSendConfirmed((ackCode, rtt) => {
      console.log(`[Mesh] Message confirmé par LoRa! ACK:${ackCode}, RTT:${rtt}ms`);
      setLastAck({ackCode, rtt});
      
      // Afficher une notification si l'app est en foreground
      Alert.alert('✅ Message confirmé', 
        `Votre message a été transmis sur LoRa et confirmé par le réseau.\n\n` +
        `ACK: ${ackCode}\n` +
        `Temps aller-retour: ${rtt}ms`);
    });
    
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [bleConnected, onSendConfirmed]);

  // Fusionner contacts BLE (MeshCore getContacts) + pairs MQTT sur le radar
  const allPeers = useMemo((): RadarPeer[] => {
    const mqttNodeIds = new Set(radarPeers.map(p => p.nodeId));
    const blePeers: RadarPeer[] = bleConnected
      ? bleMeshContacts
          .filter(c => c.pubkeyPrefix)
          .filter(c => !mqttNodeIds.has(`MESH-${c.pubkeyPrefix.slice(0, 8).toUpperCase()}`))
          .map(c => ({
            nodeId: `MESH-${c.pubkeyPrefix.slice(0, 8).toUpperCase()}`,
            name: c.name,
            online: c.lastSeen > 0 && (Date.now() / 1000 - c.lastSeen) < 600,
            pubkeyHex: c.pubkeyHex,
            signalStrength: 75,
            distanceMeters: 0,
            bearingRad: 0,
            lastSeen: c.lastSeen > 0 ? c.lastSeen * 1000 : Date.now(),
            lat: c.lat,
            lng: c.lng,
          }))
      : [];
    return [...radarPeers, ...blePeers];
  }, [radarPeers, bleMeshContacts, bleConnected]);

  const filteredPeers = useMemo(() => {
    switch (filter) {
      case 'online':
        return allPeers.filter((p) => p.online);
      default:
        return allPeers;
    }
  }, [filter, allPeers]);

  const handleScan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsScanning((prev) => !prev);
    if (!isScanning) {
      setTimeout(() => {
        setIsScanning(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 6000);
    }
  }, [isScanning]);

  const handleNodePress = useCallback((peer: RadarPeer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPeer(peer);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
    setSelectedPeer(null);
  }, []);

  const handleSendTestMessage = useCallback(async () => {
    if (!testMsg.trim()) return;
    setSendingTest(true);
    
    try {
      if (testRecipient.trim()) {
        // Envoi DM via LoRa natif (pas MQTT!)
        // Chercher la clé publique du destinataire dans les contacts BLE
        const recipientNodeId = testRecipient.trim().toUpperCase();
        const contact = bleMeshContacts.find(c => 
          c.pubkeyPrefix && recipientNodeId.includes(c.pubkeyPrefix.slice(0, 8).toUpperCase())
        );
        
        if (!contact) {
          Alert.alert('Contact inconnu', 
            `Le destinataire ${recipientNodeId} n'est pas dans vos contacts BLE. ` +
            'Veuillez d\'abord ajouter ce contact ou utiliser le broadcast (sans destinataire).');
          setSendingTest(false);
          return;
        }
        
        console.log(`[TestMessage] Envoi DM à ${recipientNodeId} via LoRa`);
        console.log(`[TestMessage] Clé publique: ${contact.pubkeyHex.slice(0, 20)}...`);
        
        await sendDirectMessage(contact.pubkeyHex, testMsg.trim());
        
        // Attendre un peu pour voir si on reçoit un ACK
        setTimeout(() => {
          Alert.alert('Message transmis', 
            `Message envoyé à ${recipientNodeId} via LoRa. ` +
            'Note: Le destinataire doit être à portée et avoir votre contact enregistré pour recevoir.');
        }, 500);
        
      } else if (bleConnected) {
        // Broadcast sur le canal actif
        console.log(`[TestMessage] Envoi broadcast sur canal actif: "${testMsg.trim()}"`);
        
        // CORRECTION: Vérifier que le canal est configuré avant envoi
        if (!channelConfigured && currentChannel === 0) {
          console.warn('[TestMessage] Canal 0 peut ne pas être configuré, tentative d\'envoi...');
        }
        
        await sendChannelMessage(testMsg.trim());
        
        Alert.alert('Message transmis', 
          'Message envoyé en broadcast sur le canal LoRa actif. ' +
          'Tous les nodes à portée recevront ce message.' +
          (channelConfigured ? '' : '\n\n⚠️ Canal non confirmé configuré. Si le message n\'est pas reçu, déconnectez et reconnectez le BLE.'));
      } else {
        Alert.alert('Erreur', 'Connectez-vous à un device BLE pour envoyer via LoRa');
      }
      
      setTestMsg('');
    } catch (err: any) {
      console.error('[TestMessage] Erreur:', err);
      Alert.alert('Erreur envoi', err.message || 'Échec de l\'envoi');
    } finally {
      setSendingTest(false);
    }
  }, [testMsg, testRecipient, bleConnected, sendDirectMessage, sendChannelMessage, bleMeshContacts]);

  return (
    <View style={styles.screenContainer}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={[styles.liveDot, { backgroundColor: isInternetOnly ? Colors.blue : Colors.green }]} />
          <Text style={styles.topBarTitle}>
            {isInternetOnly ? 'Internet Bridge' : 'MeshCore Network'}
          </Text>
        </View>
        {!isInternetOnly && <ScanButton isScanning={isScanning} onPress={handleScan} />}
      </View>

      <InternetModeBanner />
      <GatewayStatusBanner />

      {!isInternetOnly && (
        <>
          <StatsRow peers={allPeers} mqttConnected={mqttState === 'connected'} deviceInfo={deviceInfo} />
          <RadioBand deviceInfo={deviceInfo} />
        </>
      )}

      {/* Barre de connexion gateway — remplace les boutons flottants */}
      {!isInternetOnly && (
        <View style={styles.connectionSection}>
          {bleConnected && bleDevice ? (
            <View style={styles.connectedDeviceRow}>
              <View style={styles.connectedDeviceLeft}>
                <View style={[styles.connectedDot, { backgroundColor: Colors.green }]} />
                <Text style={styles.connectedDeviceName} numberOfLines={1}>
                  {bleDevice.name}
                </Text>
              </View>
              <View style={styles.deviceActionsRow}>
                <TouchableOpacity
                  style={[styles.deviceActionBtn, { backgroundColor: `${Colors.purple}25`, borderColor: `${Colors.purple}50` }]}
                  onPress={() => { setSelectedDeviceId(1); setShowRoomServerModal(true); }}
                  activeOpacity={0.7}
                >
                  <Server size={12} color={Colors.purple} />
                  <Text style={[styles.deviceActionText, { color: Colors.purple }]}>Room Server</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deviceActionBtn, { backgroundColor: `${Colors.cyan}25`, borderColor: `${Colors.cyan}50` }]}
                  onPress={() => { setSelectedDeviceId(1); setShowRepeaterModal(true); }}
                  activeOpacity={0.7}
                >
                  <Radio size={12} color={Colors.cyan} />
                  <Text style={[styles.deviceActionText, { color: Colors.cyan }]}>Repeater</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deviceActionBtn, { backgroundColor: `${Colors.accent}20`, borderColor: `${Colors.accent}40` }]}
                  onPress={() => setShowGatewayModal(true)}
                  activeOpacity={0.7}
                >
                  <Radio size={12} color={Colors.textMuted} />
                  <Text style={[styles.deviceActionText, { color: Colors.textMuted }]}>BLE</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.connectButtonsRow}>
              <TouchableOpacity style={[styles.connectGatewayBtn, { flex: 1 }]} onPress={() => setShowGatewayModal(true)} activeOpacity={0.8}>
                <Radio size={16} color={Colors.accent} />
                <Text style={styles.connectGatewayText}>Gateway LoRa</Text>
                <Text style={styles.connectGatewayArrow}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.connectGatewayBtn, { flex: 1, borderColor: `${Colors.accent}30` }]} onPress={() => setShowUsbModal(true)} activeOpacity={0.8}>
                <Usb size={16} color={Colors.textMuted} />
                <Text style={[styles.connectGatewayText, { color: Colors.textMuted }]}>USB Serial</Text>
                <Text style={[styles.connectGatewayArrow, { color: Colors.textMuted }]}>→</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Section Test Message */}
      {bleConnected && (
        <View style={styles.testMessageSection}>
          <Text style={styles.testMessageTitle}>🧪 Envoi Test</Text>
          <TextInput
            style={styles.testInput}
            placeholder="Destinataire (NodeId, ex: MESH-XXXX) - laisser vide pour broadcast"
            placeholderTextColor={Colors.textMuted}
            value={testRecipient}
            onChangeText={setTestRecipient}
            autoCapitalize="characters"
          />
          <View style={styles.testInputRow}>
            <TextInput
              style={[styles.testInput, { flex: 1 }]}
              placeholder="Message test..."
              placeholderTextColor={Colors.textMuted}
              value={testMsg}
              onChangeText={setTestMsg}
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={[styles.testSendBtn, (!testMsg.trim() || sendingTest) && styles.testSendBtnDisabled]}
              onPress={handleSendTestMessage}
              disabled={!testMsg.trim() || sendingTest}
              activeOpacity={0.7}
            >
              {sendingTest ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Send size={18} color={Colors.background} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.testHint}>
            {testRecipient.trim() 
              ? '→ Message privé au destinataire' 
              : '→ Broadcast sur le canal LoRa actif'}
          </Text>
        </View>
      )}

      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'radar' && styles.viewToggleBtnActive]}
          onPress={() => { setViewMode('radar'); Haptics.selectionAsync(); }}
          activeOpacity={0.7}
        >
          <Activity size={14} color={viewMode === 'radar' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.viewToggleText, viewMode === 'radar' && styles.viewToggleTextActive]}>
            Radar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          onPress={() => { setViewMode('list'); Haptics.selectionAsync(); }}
          activeOpacity={0.7}
        >
          <Cpu size={14} color={viewMode === 'list' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>
            Devices
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'radar' && (
        <View style={styles.radarCard}>
          <MeshRadar peers={filteredPeers} isScanning={isScanning} myNodeId={identity?.nodeId} />
          <View style={styles.radarLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.green }]} />
              <Text style={styles.legendText}>Fort (&gt;70%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
              <Text style={styles.legendText}>Moyen</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.red }]} />
              <Text style={styles.legendText}>Faible</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={styles.legendText}>Hors ligne</Text>
            </View>
          </View>
        </View>
      )}

      {!isInternetOnly && <View style={styles.nodesSection}>
        <View style={styles.nodesSectionHeader}>
          <Text style={styles.nodesSectionTitle}>
            {viewMode === 'radar' ? 'Pairs proches' : 'Tous les pairs'}
          </Text>
          <Text style={styles.nodesCount}>{filteredPeers.length}</Text>
        </View>

        <FilterChips active={filter} onChange={setFilter} />

        {filteredPeers.map((peer) => (
          <NodeItem key={peer.nodeId} peer={peer} onPress={() => handleNodePress(peer)} />
        ))}

        {filteredPeers.length === 0 && (
          <View style={styles.emptyState}>
            <ScanSearch size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {mqttState === 'connected' ? 'Aucun pair détecté' : 'Connexion MQTT...'}
            </Text>
            <Text style={styles.emptySubtext}>
              {mqttState === 'connected'
                ? 'Les pairs apparaissent quand ils se connectent'
                : 'En attente du broker MQTT'}
            </Text>
          </View>
        )}
      </View>}

      {isInternetOnly && (
        <View style={styles.nodesSection}>
          <View style={styles.nodesSectionHeader}>
            <Text style={styles.nodesSectionTitle}>Remote Gateways</Text>
            <Text style={styles.nodesCount}>2</Text>
          </View>
          <View style={styles.internetGatewayCard}>
            <View style={styles.internetGwLeft}>
              <View style={[styles.nodeIcon, { borderColor: Colors.green }]}>
                <Server size={16} color={Colors.green} />
                <View style={[styles.nodeOnlineDot, { backgroundColor: Colors.green }]} />
              </View>
              <View style={styles.nodeInfo}>
                <Text style={styles.nodeName}>Gateway-EU</Text>
                <Text style={styles.nodeDistance}>MQTT · emqx.io · 23ms</Text>
              </View>
            </View>
            <View style={[styles.pairingBadge, { backgroundColor: Colors.greenDim, borderColor: Colors.green + '40' }]}>
              <Check size={10} color={Colors.green} />
              <Text style={[styles.pairingBadgeText, { color: Colors.green }]}>CONNECTED</Text>
            </View>
          </View>
          <View style={styles.internetGatewayCard}>
            <View style={styles.internetGwLeft}>
              <View style={[styles.nodeIcon, { borderColor: Colors.yellow }]}>
                <Server size={16} color={Colors.yellow} />
              </View>
              <View style={styles.nodeInfo}>
                <Text style={styles.nodeName}>Relay-FR-07</Text>
                <Text style={styles.nodeDistance}>MQTT · custom broker · 45ms</Text>
              </View>
            </View>
            <View style={[styles.pairingBadge, { backgroundColor: Colors.yellowDim, borderColor: Colors.yellow + '40' }]}>
              <Text style={[styles.pairingBadgeText, { color: Colors.yellow }]}>IDLE</Text>
            </View>
          </View>
        </View>
      )}

      <NodeDetailModal peer={selectedPeer} visible={showDetail} onClose={handleCloseDetail} />
      <GatewayScanModal visible={showGatewayModal} onClose={() => setShowGatewayModal(false)} />
      <UsbSerialScanModal visible={showUsbModal} onClose={() => setShowUsbModal(false)} />
      
      {/* Modals Room Server et Repeater */}
      {selectedDeviceId && (
        <>
          <RoomServerConfigModal 
            visible={showRoomServerModal} 
            onClose={() => setShowRoomServerModal(false)} 
          />
          <RepeaterConfigModal 
            visible={showRepeaterModal} 
            onClose={() => setShowRepeaterModal(false)} 
          />
        </>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.green,
  },
  topBarTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.accentGlow,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  scanButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  scanButtonText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  scanButtonTextActive: {
    color: Colors.black,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statChipValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  statChipLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  radioBand: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  radioItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  radioLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  radioValue: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  radioValuePlaceholder: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  radioDivider: {
    width: 0.5,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 3,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.surfaceLight,
  },
  viewToggleText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  viewToggleTextActive: {
    color: Colors.accent,
  },
  radarCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 8,
    marginBottom: 16,
  },
  radarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  nodesSection: {
    paddingHorizontal: 16,
  },
  nodesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nodesSectionTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  nodesCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accentGlow,
    borderColor: Colors.accentDim,
  },
  filterChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.accent,
  },
  nodeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  nodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  nodeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  nodeOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  nodeInfo: {
    flex: 1,
  },
  nodeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  nodeName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  nodeNameOffline: {
    color: Colors.textMuted,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  nodeDistance: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  nodeHops: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  nodeSep: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  nodeRssi: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  nodeRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  nodeSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nodeSignalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nodeBatteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nodeBatteryText: {
    fontSize: 11,
    fontWeight: '500',
  },
  nodeLastSeen: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  pairingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  pairingBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  deviceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deviceBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceHighlight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modalNodeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  modalNodeName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalNodeId: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  modalGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  modalGridItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  modalGridValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  modalGridLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  modalDetails: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  modalDetailLabel: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  modalDetailValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalActionBtnAdd: {
    backgroundColor: Colors.accent,
  },
  modalActionBtnContact: {
    backgroundColor: Colors.greenDim,
    borderWidth: 1,
    borderColor: Colors.green + '40',
  },
  modalActionBtnDM: {
    backgroundColor: Colors.blue,
  },
  modalActionBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700',
  },
  pairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  pairButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  unpairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.redDim,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.red + '40',
  },
  unpairButtonText: {
    color: Colors.red,
    fontSize: 16,
    fontWeight: '700',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentGlow,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  retryButtonText: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  gwBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 214, 143, 0.2)',
    padding: 14,
    overflow: 'hidden',
  },
  gwBannerGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.green,
  },
  gwBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gwBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gwBannerTitle: {
    color: Colors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  gwBannerUptime: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  gwBannerStats: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  gwBannerStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gwBannerStatValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  gwBannerStatLabel: {
    color: Colors.textMuted,
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  gwBannerStatDivider: {
    width: 0.5,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  gwRecentJobs: {
    gap: 4,
  },
  gwJobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  gwJobDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  gwJobText: {
    color: Colors.textSecondary,
    fontSize: 10,
    flex: 1,
  },
  gwJobStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  internetBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(77, 172, 255, 0.2)',
    padding: 16,
    overflow: 'hidden',
  },
  internetBannerGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.blue,
  },
  internetBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  internetBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  internetBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.blueDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  internetBannerTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  internetBannerSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  internetModeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  internetModeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  internetBannerDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  internetFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  internetFlowNode: {
    alignItems: 'center',
    flex: 1,
  },
  internetFlowEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  internetFlowLabel: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  internetFlowSub: {
    color: Colors.textMuted,
    fontSize: 9,
    marginTop: 1,
  },
  internetFlowArrow: {
    paddingHorizontal: 2,
  },
  internetFlowArrowText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  internetStatsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  internetStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  internetStatValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
    fontFamily: 'monospace',
  },
  internetStatLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  internetStatDivider: {
    width: 0.5,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  internetGatewayCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  internetGwLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  gatewayFloatingBtn: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 30,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  gatewayFloatingText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.background,
  },
  deviceConfigRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  configBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  configBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.background,
  },
  connectionSection: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  connectedDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  connectedDeviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectedDeviceName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  deviceActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  deviceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  deviceActionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  connectButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  connectGatewayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentGlow,
    borderWidth: 1,
    borderColor: Colors.accentDim,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  connectGatewayText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  connectGatewayArrow: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  // Test Message Section
  testMessageSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  testMessageTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  testInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    marginBottom: 8,
  },
  testInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  testSendBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
    minHeight: 48,
  },
  testSendBtnDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  testHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
