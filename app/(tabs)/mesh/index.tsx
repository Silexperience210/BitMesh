import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import {
  Radio,
  Battery,
  Wifi,
  MapPin,
  RefreshCw,
  Zap,
  Link,
  Unlink,
  ChevronDown,
  ChevronUp,
  Activity,
  Signal,
  Cpu,
  Package,
  ScanSearch,
  X,
  Check,
  AlertTriangle,
  Loader,
  Server,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { mockNodes, meshStats, MeshNode, mockGatewayStats, mockGatewayRelayLog } from '@/mocks/data';
import { useGateway } from '@/providers/GatewayProvider';
import { useAppSettings } from '@/providers/AppSettingsProvider';
import {
  formatTime,
  getSignalColor,
  getPairingColor,
  getPairingLabel,
  formatRssi,
  formatSnr,
} from '@/utils/helpers';
import MeshRadar from '@/components/MeshRadar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ViewMode = 'radar' | 'list';
type FilterMode = 'all' | 'paired' | 'discovered' | 'online';

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

function PairingStateBadge({ state }: { state: string }) {
  const color = getPairingColor(state);
  const label = getPairingLabel(state);

  const iconSize = 10;
  let icon = null;
  switch (state) {
    case 'paired':
      icon = <Check size={iconSize} color={color} />;
      break;
    case 'pairing':
      icon = <Loader size={iconSize} color={color} />;
      break;
    case 'discovered':
      icon = <ScanSearch size={iconSize} color={color} />;
      break;
    case 'failed':
      icon = <AlertTriangle size={iconSize} color={color} />;
      break;
    default:
      icon = <Unlink size={iconSize} color={color} />;
  }

  return (
    <View style={[styles.pairingBadge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
      {icon}
      <Text style={[styles.pairingBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function DeviceTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    relay: Colors.blue,
    gateway: Colors.purple,
    repeater: Colors.cyan,
    client: Colors.textSecondary,
    node: Colors.textSecondary,
  };
  const bgMap: Record<string, string> = {
    relay: Colors.blueDim,
    gateway: Colors.purpleDim,
    repeater: Colors.cyanDim,
    client: Colors.surfaceHighlight,
    node: Colors.surfaceHighlight,
  };
  const color = colorMap[type] ?? Colors.textMuted;
  const bg = bgMap[type] ?? Colors.surfaceHighlight;

  return (
    <View style={[styles.deviceBadge, { backgroundColor: bg }]}>
      <Text style={[styles.deviceBadgeText, { color }]}>{type.toUpperCase()}</Text>
    </View>
  );
}

function StatsRow() {
  const discoveredCount = mockNodes.filter((n) => n.pairingState === 'discovered').length;
  const pairedCount = mockNodes.filter((n) => n.pairingState === 'paired').length;
  const pairingCount = mockNodes.filter((n) => n.pairingState === 'pairing').length;

  return (
    <View style={styles.statsRow}>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.green }]} />
        <Text style={styles.statChipValue}>{meshStats.onlineNodes}</Text>
        <Text style={styles.statChipLabel}>Online</Text>
      </View>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.accent }]} />
        <Text style={styles.statChipValue}>{pairedCount}</Text>
        <Text style={styles.statChipLabel}>Paired</Text>
      </View>
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.yellow }]} />
        <Text style={styles.statChipValue}>{discoveredCount}</Text>
        <Text style={styles.statChipLabel}>New</Text>
      </View>
      {pairingCount > 0 && (
        <View style={styles.statChip}>
          <View style={[styles.statDot, { backgroundColor: Colors.blue }]} />
          <Text style={styles.statChipValue}>{pairingCount}</Text>
          <Text style={styles.statChipLabel}>Pairing</Text>
        </View>
      )}
      <View style={styles.statChip}>
        <View style={[styles.statDot, { backgroundColor: Colors.textMuted }]} />
        <Text style={styles.statChipValue}>{meshStats.totalNodes}</Text>
        <Text style={styles.statChipLabel}>Total</Text>
      </View>
    </View>
  );
}

function RadioBand() {
  return (
    <View style={styles.radioBand}>
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>FREQ</Text>
        <Text style={styles.radioValue}>{meshStats.frequency}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>SF</Text>
        <Text style={styles.radioValue}>{meshStats.spreadFactor}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>BW</Text>
        <Text style={styles.radioValue}>{meshStats.bandwidth}</Text>
      </View>
      <View style={styles.radioDivider} />
      <View style={styles.radioItem}>
        <Text style={styles.radioLabel}>TX</Text>
        <Text style={styles.radioValue}>{meshStats.txPower}</Text>
      </View>
    </View>
  );
}

function FilterChips({ active, onChange }: { active: FilterMode; onChange: (f: FilterMode) => void }) {
  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'online', label: 'Online' },
    { key: 'paired', label: 'Paired' },
    { key: 'discovered', label: 'New' },
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

function NodeDetailModal({ node, visible, onClose }: { node: MeshNode | null; visible: boolean; onClose: () => void }) {
  if (!node) return null;

  const signalColor = getSignalColor(node.signalStrength);
  const batteryColor = node.battery > 50 ? Colors.green : node.battery > 20 ? Colors.accent : Colors.red;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <View style={[styles.modalNodeIcon, { borderColor: getPairingColor(node.pairingState) }]}>
                {node.isRelay ? (
                  <Zap size={22} color={getPairingColor(node.pairingState)} />
                ) : (
                  <Radio size={22} color={getPairingColor(node.pairingState)} />
                )}
              </View>
              <View>
                <Text style={styles.modalNodeName}>{node.name}</Text>
                <Text style={styles.modalNodeId}>{node.id.toUpperCase()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.modalClose}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBadges}>
            <PairingStateBadge state={node.pairingState} />
            <DeviceTypeBadge type={node.deviceType} />
          </View>

          <View style={styles.modalGrid}>
            <View style={styles.modalGridItem}>
              <Wifi size={14} color={signalColor} />
              <Text style={[styles.modalGridValue, { color: signalColor }]}>{node.signalStrength}%</Text>
              <Text style={styles.modalGridLabel}>Signal</Text>
            </View>
            <View style={styles.modalGridItem}>
              <Signal size={14} color={Colors.blue} />
              <Text style={styles.modalGridValue}>{formatRssi(node.rssi)}</Text>
              <Text style={styles.modalGridLabel}>RSSI</Text>
            </View>
            <View style={styles.modalGridItem}>
              <Activity size={14} color={Colors.cyan} />
              <Text style={styles.modalGridValue}>{formatSnr(node.snr)}</Text>
              <Text style={styles.modalGridLabel}>SNR</Text>
            </View>
            <View style={styles.modalGridItem}>
              <Battery size={14} color={batteryColor} />
              <Text style={[styles.modalGridValue, { color: batteryColor }]}>{node.battery}%</Text>
              <Text style={styles.modalGridLabel}>Battery</Text>
            </View>
          </View>

          <View style={styles.modalDetails}>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Distance</Text>
              <Text style={styles.modalDetailValue}>{node.distance}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Hops</Text>
              <Text style={styles.modalDetailValue}>{node.hops}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Firmware</Text>
              <Text style={styles.modalDetailValue}>{node.firmware}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Frequency</Text>
              <Text style={styles.modalDetailValue}>{node.frequency}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Channel</Text>
              <Text style={styles.modalDetailValue}>Ch {node.channel}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Airtime</Text>
              <Text style={styles.modalDetailValue}>{node.airtime}%</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Packets RX/TX</Text>
              <Text style={styles.modalDetailValue}>{node.packetsRx} / {node.packetsTx}</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Peers</Text>
              <Text style={styles.modalDetailValue}>{node.connectedPeers.length} connected</Text>
            </View>
            <View style={styles.modalDetailRow}>
              <Text style={styles.modalDetailLabel}>Last seen</Text>
              <Text style={styles.modalDetailValue}>{formatTime(node.lastSeen)}</Text>
            </View>
          </View>

          {node.pairingState === 'discovered' && (
            <TouchableOpacity
              style={styles.pairButton}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onClose();
              }}
            >
              <Link size={18} color={Colors.black} />
              <Text style={styles.pairButtonText}>Pair Device</Text>
            </TouchableOpacity>
          )}

          {node.pairingState === 'paired' && (
            <TouchableOpacity
              style={styles.unpairButton}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onClose();
              }}
            >
              <Unlink size={18} color={Colors.red} />
              <Text style={styles.unpairButtonText}>Unpair Device</Text>
            </TouchableOpacity>
          )}

          {node.pairingState === 'failed' && (
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onClose();
              }}
            >
              <RefreshCw size={18} color={Colors.accent} />
              <Text style={styles.retryButtonText}>Retry Pairing</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function NodeItem({ node, onPress }: { node: MeshNode; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const signalColor = getSignalColor(node.signalStrength);
  const batteryColor = node.battery > 50 ? Colors.green : node.battery > 20 ? Colors.accent : Colors.red;

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
          <View style={[styles.nodeIcon, { borderColor: node.isOnline ? getPairingColor(node.pairingState) : Colors.textMuted }]}>
            {node.deviceType === 'relay' || node.deviceType === 'repeater' ? (
              <Zap size={16} color={node.isOnline ? getPairingColor(node.pairingState) : Colors.textMuted} />
            ) : node.deviceType === 'gateway' ? (
              <Package size={16} color={node.isOnline ? getPairingColor(node.pairingState) : Colors.textMuted} />
            ) : (
              <Radio size={16} color={node.isOnline ? getPairingColor(node.pairingState) : Colors.textMuted} />
            )}
            {node.isOnline && (
              <View style={[styles.nodeOnlineDot, { backgroundColor: getPairingColor(node.pairingState) }]} />
            )}
          </View>
          <View style={styles.nodeInfo}>
            <View style={styles.nodeNameRow}>
              <Text style={[styles.nodeName, !node.isOnline && styles.nodeNameOffline]} numberOfLines={1}>
                {node.name}
              </Text>
              <PairingStateBadge state={node.pairingState} />
            </View>
            <View style={styles.nodeMetaRow}>
              <MapPin size={10} color={Colors.textMuted} />
              <Text style={styles.nodeDistance}>{node.distance}</Text>
              <Text style={styles.nodeHops}>{node.hops}h</Text>
              <Text style={styles.nodeSep}>·</Text>
              <Text style={styles.nodeRssi}>{node.rssi}dBm</Text>
            </View>
          </View>
        </View>

        <View style={styles.nodeRight}>
          <View style={styles.nodeSignalRow}>
            <Wifi size={12} color={signalColor} />
            <Text style={[styles.nodeSignalText, { color: signalColor }]}>
              {node.signalStrength}%
            </Text>
          </View>
          <View style={styles.nodeBatteryRow}>
            <Battery size={12} color={batteryColor} />
            <Text style={[styles.nodeBatteryText, { color: batteryColor }]}>
              {node.battery}%
            </Text>
          </View>
          <Text style={styles.nodeLastSeen}>{formatTime(node.lastSeen)}</Text>
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

  const stats = mockGatewayStats;
  const recentJobs = mockGatewayRelayLog.slice(0, 3);
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
                <Text style={styles.gwJobText} numberOfLines={1}>{job.detail}</Text>
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
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null);
  const [showDetail, setShowDetail] = useState<boolean>(false);
  const { settings } = useAppSettings();
  const isInternetOnly = settings.connectionMode === 'internet';

  const filteredNodes = useMemo(() => {
    switch (filter) {
      case 'online':
        return mockNodes.filter((n) => n.isOnline);
      case 'paired':
        return mockNodes.filter((n) => n.pairingState === 'paired');
      case 'discovered':
        return mockNodes.filter((n) => n.pairingState === 'discovered' || n.pairingState === 'pairing');
      default:
        return mockNodes;
    }
  }, [filter]);

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

  const handleNodePress = useCallback((node: MeshNode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedNode(node);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
    setSelectedNode(null);
  }, []);

  return (
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
          <StatsRow />
          <RadioBand />
        </>
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
          <MeshRadar nodes={filteredNodes} isScanning={isScanning} />
          <View style={styles.radarLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.green }]} />
              <Text style={styles.legendText}>Paired</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.yellow }]} />
              <Text style={styles.legendText}>New</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.blue }]} />
              <Text style={styles.legendText}>Pairing</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.red }]} />
              <Text style={styles.legendText}>Failed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.textMuted }]} />
              <Text style={styles.legendText}>Offline</Text>
            </View>
          </View>
        </View>
      )}

      {!isInternetOnly && <View style={styles.nodesSection}>
        <View style={styles.nodesSectionHeader}>
          <Text style={styles.nodesSectionTitle}>
            {viewMode === 'radar' ? 'Nearby Devices' : 'All Devices'}
          </Text>
          <Text style={styles.nodesCount}>{filteredNodes.length}</Text>
        </View>

        <FilterChips active={filter} onChange={setFilter} />

        {filteredNodes.map((node) => (
          <NodeItem key={node.id} node={node} onPress={() => handleNodePress(node)} />
        ))}

        {filteredNodes.length === 0 && (
          <View style={styles.emptyState}>
            <ScanSearch size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No devices found</Text>
            <Text style={styles.emptySubtext}>Try scanning or changing filters</Text>
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

      <NodeDetailModal node={selectedNode} visible={showDetail} onClose={handleCloseDetail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
});
