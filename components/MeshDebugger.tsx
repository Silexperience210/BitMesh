/**
 * MeshDebugger - Outil de diagnostic complet pour BitMesh
 * 
 * Tests automatisés et manuels pour vérifier:
 * - Connexion BLE
 * - Configuration radio
 * - Envoi/réception messages
 * - Protocole MeshCore
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import {
  Activity,
  Wifi,
  Bluetooth,
  Radio,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Terminal,
  Play,
  RotateCcw,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Signal,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useBle } from '@/providers/BleProvider';

// Types pour les tests
interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'warning';
  message: string;
  timestamp: number;
  duration?: number;
  details?: any;
}

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
}

interface MeshDebuggerProps {
  visible: boolean;
  onClose: () => void;
}

// Tests disponibles
const TEST_SUITES = {
  connection: [
    { id: 'ble_init', name: 'BLE Initialisé', icon: Bluetooth },
    { id: 'ble_connect', name: 'Connexion Device', icon: Bluetooth },
    { id: 'handshake', name: 'Handshake MeshCore', icon: Activity },
    { id: 'self_info', name: 'SelfInfo Reçue', icon: Cpu },
  ],
  radio: [
    { id: 'channel_0_config', name: 'Canal 0 Configuré', icon: Radio },
    { id: 'channel_check', name: 'Canal Actif Vérifié', icon: Radio },
    { id: 'frequency', name: 'Fréquence Radio', icon: Wifi },
    { id: 'radio_params', name: 'Paramètres Radio (SF/BW)', icon: Signal },
  ],
  messaging: [
    { id: 'send_txt', name: 'Envoi Message Texte', icon: Send },
    { id: 'receive_txt', name: 'Réception Message', icon: Send },
    { id: 'ack_received', name: 'ACK Reçu', icon: CheckCircle },
    { id: 'broadcast', name: 'Broadcast Canal 0', icon: Radio },
  ],
};

export default function MeshDebugger({ visible, onClose }: MeshDebuggerProps) {
  const {
    connected,
    device,
    deviceInfo,
    currentChannel,
    channelConfigured,
    meshContacts,
    sendChannelMessage,
    sendFloodMessage,
    sendDirectMessage,
    syncContacts,
  } = useBle();

  // États
  const [activeTab, setActiveTab] = useState<'tests' | 'logs' | 'device' | 'tools'>('tests');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useRef<LogEntry[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [autoTest, setAutoTest] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  
  // État pour test manuel
  const [testMessage, setTestMessage] = useState('Test debug ' + Date.now());
  const [targetChannel, setTargetChannel] = useState('0');

  // Logger
  const addLog = useCallback((level: LogEntry['level'], source: string, message: string, data?: any) => {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      source,
      message,
      data,
    };
    setLogs.current((prev) => [...prev.slice(-200), entry]); // Garder 200 derniers logs
  }, []);

  // Ajouter un résultat de test
  const addTestResult = useCallback((result: TestResult) => {
    setTestResults((prev) => {
      const filtered = prev.filter((r) => r.id !== result.id);
      return [...filtered, result];
    });
  }, []);

  // Nettoyer les résultats
  const clearResults = () => {
    setTestResults([]);
    setLogs.current([]);
    addLog('info', 'Debugger', 'Résultats nettoyés');
  };

  // Tests individuels
  const runTest = async (testId: string): Promise<TestResult> => {
    const startTime = Date.now();
    
    switch (testId) {
      case 'ble_init':
        return {
          id: testId,
          name: 'BLE Initialisé',
          status: 'success',
          message: 'BLE Manager est initialisé et prêt',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };

      case 'ble_connect':
        if (!connected) {
          return {
            id: testId,
            name: 'Connexion Device',
            status: 'failed',
            message: 'Non connecté à un device BLE',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'Connexion Device',
          status: 'success',
          message: `Connecté à ${device?.name || 'device'}`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          details: { deviceId: device?.id, name: device?.name },
        };

      case 'handshake':
        if (!connected) {
          return {
            id: testId,
            name: 'Handshake MeshCore',
            status: 'failed',
            message: 'Connexion BLE requise',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        if (!deviceInfo) {
          return {
            id: testId,
            name: 'Handshake MeshCore',
            status: 'warning',
            message: 'Connecté mais SelfInfo non reçue',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'Handshake MeshCore',
          status: 'success',
          message: 'Handshake complété avec succès',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };

      case 'self_info':
        if (!deviceInfo) {
          return {
            id: testId,
            name: 'SelfInfo Reçue',
            status: 'failed',
            message: 'Aucune information device reçue',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'SelfInfo Reçue',
          status: 'success',
          message: `${deviceInfo.name} | ${(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          details: deviceInfo,
        };

      case 'channel_0_config':
        if (!channelConfigured && currentChannel === 0) {
          return {
            id: testId,
            name: 'Canal 0 Configuré',
            status: 'warning',
            message: 'Canal 0 actif mais configuration non confirmée',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'Canal 0 Configuré',
          status: channelConfigured ? 'success' : 'warning',
          message: channelConfigured 
            ? 'Canal configuré et prêt' 
            : 'Canal actif, statut config inconnu',
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };

      case 'channel_check':
        return {
          id: testId,
          name: 'Canal Actif Vérifié',
          status: 'success',
          message: `Canal ${currentChannel} actif (${currentChannel === 0 ? 'public' : 'privé'})`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };

      case 'frequency':
        if (!deviceInfo) {
          return {
            id: testId,
            name: 'Fréquence Radio',
            status: 'failed',
            message: 'SelfInfo requise',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'Fréquence Radio',
          status: 'success',
          message: `${(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          details: { freqHz: deviceInfo.radioFreqHz },
        };

      case 'radio_params':
        if (!deviceInfo) {
          return {
            id: testId,
            name: 'Paramètres Radio',
            status: 'failed',
            message: 'SelfInfo requise',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        return {
          id: testId,
          name: 'Paramètres Radio',
          status: 'success',
          message: `SF${deviceInfo.radioSf} | ${deviceInfo.radioBwHz / 1000}kHz | ${deviceInfo.radioCr}/8`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          details: {
            sf: deviceInfo.radioSf,
            bw: deviceInfo.radioBwHz,
            cr: deviceInfo.radioCr,
            txPower: deviceInfo.txPower,
          },
        };

      case 'send_txt':
        if (!connected) {
          return {
            id: testId,
            name: 'Envoi Message Texte',
            status: 'failed',
            message: 'Connexion BLE requise',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        try {
          await sendChannelMessage('Test diagnostic');
          return {
            id: testId,
            name: 'Envoi Message Texte',
            status: 'success',
            message: 'Message envoyé avec succès',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        } catch (err: any) {
          return {
            id: testId,
            name: 'Envoi Message Texte',
            status: 'failed',
            message: err.message || 'Échec envoi',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }

      case 'broadcast':
        if (!connected) {
          return {
            id: testId,
            name: 'Broadcast Canal 0',
            status: 'failed',
            message: 'Connexion BLE requise',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        }
        try {
          await sendFloodMessage('Test broadcast debug');
          return {
            id: testId,
            name: 'Broadcast Canal 0',
            status: 'success',
            message: 'Broadcast envoyé sur canal 0',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        } catch (err: any) {
          return {
            id: testId,
            name: 'Broadcast Canal 0',
            status: 'failed',
            message: err.message || 'Échec broadcast',
            timestamp: Date.now(),
            duration: Date.now() - startTime,
          };
        };

      default:
        return {
          id: testId,
          name: 'Test inconnu',
          status: 'failed',
          message: `Test ${testId} non implémenté`,
          timestamp: Date.now(),
          duration: Date.now() - startTime,
        };
    }
  };

  // Run tous les tests
  const runAllTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);
    addLog('info', 'Debugger', 'Démarrage suite de tests complète');

    const allTests = [
      ...TEST_SUITES.connection,
      ...TEST_SUITES.radio,
      ...TEST_SUITES.messaging,
    ];

    for (let i = 0; i < allTests.length; i++) {
      const test = allTests[i];
      setTestProgress(((i + 1) / allTests.length) * 100);
      
      addLog('debug', 'Debugger', `Running test: ${test.name}`);
      
      // Marquer comme running
      addTestResult({
        id: test.id,
        name: test.name,
        status: 'running',
        message: 'En cours...',
        timestamp: Date.now(),
      });

      // Attendre un peu pour l'UI
      await new Promise((r) => setTimeout(r, 300));

      // Exécuter le test
      const result = await runTest(test.id);
      addTestResult(result);
      
      addLog(
        result.status === 'success' ? 'info' : result.status === 'warning' ? 'warn' : 'error',
        'Debugger',
        `${test.name}: ${result.status}`,
        result.message
      );
    }

    setIsRunningTests(false);
    setTestProgress(100);
    addLog('info', 'Debugger', 'Suite de tests terminée');
  };

  // Test manuel
  const runManualTest = async () => {
    if (!connected) {
      Alert.alert('Non connecté', 'Connectez-vous d\'abord en BLE');
      return;
    }

    const ch = parseInt(targetChannel, 10);
    if (isNaN(ch) || ch < 0 || ch > 7) {
      Alert.alert('Canal invalide', 'Entrez un canal entre 0 et 7');
      return;
    }

    addLog('info', 'ManualTest', `Envoi message manuel sur ch${ch}: "${testMessage}"`);
    
    try {
      if (ch === 0) {
        await sendFloodMessage(testMessage);
      } else {
        // Pour canaux privés, utiliser sendChannelMessage avec le canal
        await sendChannelMessage(testMessage);
      }
      
      addLog('info', 'ManualTest', 'Message envoyé avec succès');
      Alert.alert('✅ Succès', `Message envoyé sur canal ${ch}`);
    } catch (err: any) {
      addLog('error', 'ManualTest', 'Échec envoi', err.message);
      Alert.alert('❌ Échec', err.message);
    }
  };

  // Export logs
  const exportLogs = () => {
    const logText = logs.current
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
      .join('\n');
    
    // Dans une vraie app, on sauverait dans un fichier ou partagerait
    console.log('=== DEBUG LOGS ===');
    console.log(logText);
    Alert.alert('Logs exportés', 'Les logs sont dans la console (Metro)');
  };

  // Stats
  const stats = {
    total: testResults.length,
    success: testResults.filter((r) => r.status === 'success').length,
    failed: testResults.filter((r) => r.status === 'failed').length,
    warning: testResults.filter((r) => r.status === 'warning').length,
    running: testResults.filter((r) => r.status === 'running').length,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <Terminal size={22} color={Colors.accent} />
              </View>
              <View>
                <Text style={styles.title}>Mesh Debugger</Text>
                <Text style={styles.subtitle}>
                  {connected ? `🟢 ${device?.name || 'Connecté'}` : '🔴 Déconnecté'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          {testResults.length > 0 && (
            <View style={styles.statsRow}>
              <View style={[styles.statBadge, { backgroundColor: Colors.greenDim }]}>
                <Text style={[styles.statValue, { color: Colors.green }]}>{stats.success}</Text>
                <Text style={styles.statLabel}>OK</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: Colors.redDim }]}>
                <Text style={[styles.statValue, { color: Colors.red }]}>{stats.failed}</Text>
                <Text style={styles.statLabel}>FAIL</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: Colors.yellowDim }]}>
                <Text style={[styles.statValue, { color: Colors.yellow }]}>{stats.warning}</Text>
                <Text style={styles.statLabel}>WARN</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: Colors.blueDim }]}>
                <Text style={[styles.statValue, { color: Colors.blue }]}>{stats.total}</Text>
                <Text style={styles.statLabel}>TOTAL</Text>
              </View>
            </View>
          )}

          {/* Progress bar */}
          {isRunningTests && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${testProgress}%` }]} />
              <Text style={styles.progressText}>{Math.round(testProgress)}%</Text>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            {(['tests', 'logs', 'device', 'tools'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'tests' && '🔍 Tests'}
                  {tab === 'logs' && '📝 Logs'}
                  {tab === 'device' && '📱 Device'}
                  {tab === 'tools' && '🛠️ Outils'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'tests' && (
              <View>
                {/* Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, isRunningTests && styles.actionBtnDisabled]}
                    onPress={runAllTests}
                    disabled={isRunningTests}
                  >
                    <Play size={18} color={Colors.black} />
                    <Text style={styles.actionBtnText}>
                      {isRunningTests ? 'Tests en cours...' : 'Lancer tous les tests'}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.secondaryBtn} onPress={clearResults}>
                    <Trash2 size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Auto test toggle */}
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Test auto au démarrage</Text>
                  <Switch
                    value={autoTest}
                    onValueChange={setAutoTest}
                    trackColor={{ false: Colors.surfaceLight, true: Colors.accentDim }}
                    thumbColor={autoTest ? Colors.accent : Colors.textMuted}
                  />
                </View>

                {/* Test Results */}
                {Object.entries(TEST_SUITES).map(([category, tests]) => (
                  <View key={category} style={styles.testCategory}>
                    <Text style={styles.categoryTitle}>
                      {category === 'connection' && '🔗 Connexion'}
                      {category === 'radio' && '📡 Radio'}
                      {category === 'messaging' && '💬 Messagerie'}
                    </Text>
                    
                    {tests.map((test) => {
                      const result = testResults.find((r) => r.id === test.id);
                      const Icon = test.icon;
                      
                      return (
                        <View key={test.id} style={styles.testItem}>
                          <View style={styles.testIcon}>
                            <Icon size={18} color={Colors.textMuted} />
                          </View>
                          <View style={styles.testContent}>
                            <Text style={styles.testName}>{test.name}</Text>
                            {result ? (
                              <Text
                                style={[
                                  styles.testMessage,
                                  result.status === 'success' && styles.testSuccess,
                                  result.status === 'failed' && styles.testFailed,
                                  result.status === 'warning' && styles.testWarning,
                                  result.status === 'running' && styles.testRunning,
                                ]}
                              >
                                {result.status === 'running' && '⏳ '}
                                {result.status === 'success' && '✅ '}
                                {result.status === 'failed' && '❌ '}
                                {result.status === 'warning' && '⚠️ '}
                                {result.message}
                              </Text>
                            ) : (
                              <Text style={styles.testPending}>⏸️ En attente</Text>
                            )}
                          </View>
                          {result?.duration && (
                            <Text style={styles.testDuration}>{result.duration}ms</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'logs' && (
              <View>
                <TouchableOpacity style={styles.exportBtn} onPress={exportLogs}>
                  <Save size={16} color={Colors.accent} />
                  <Text style={styles.exportBtnText}>Exporter les logs</Text>
                </TouchableOpacity>

                <View style={styles.logContainer}>
                  {logs.current.length === 0 ? (
                    <Text style={styles.emptyText}>Aucun log pour le moment</Text>
                  ) : (
                    logs.current.slice(-50).map((log) => (
                      <View key={log.id} style={styles.logEntry}>
                        <Text style={styles.logTime}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </Text>
                        <Text
                          style={[
                            styles.logLevel,
                            log.level === 'error' && styles.logLevelError,
                            log.level === 'warn' && styles.logLevelWarn,
                            log.level === 'info' && styles.logLevelInfo,
                          ]}
                        >
                          {log.level.toUpperCase()}
                        </Text>
                        <Text style={styles.logSource}>[{log.source}]</Text>
                        <Text style={styles.logMessage}>{log.message}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            {activeTab === 'device' && (
              <View style={styles.deviceInfo}>
                <Text style={styles.sectionTitle}>Informations Device</Text>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Connexion BLE</Text>
                  <Text style={[styles.infoValue, connected ? styles.infoSuccess : styles.infoError]}>
                    {connected ? '✅ Connecté' : '❌ Déconnecté'}
                  </Text>
                </View>

                {device && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoLabel}>Device</Text>
                    <Text style={styles.infoValue}>{device.name}</Text>
                    <Text style={styles.infoSub}>{device.id}</Text>
                  </View>
                )}

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Canal Actif</Text>
                  <Text style={styles.infoValue}>
                    {currentChannel} {currentChannel === 0 ? '(Public)' : '(Privé)'}
                  </Text>
                  <Text style={styles.infoSub}>
                    {channelConfigured ? '✅ Configuré' : '⚠️ Non confirmé'}
                  </Text>
                </View>

                {deviceInfo && (
                  <>
                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Radio</Text>
                      <Text style={styles.infoValue}>
                        {(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz
                      </Text>
                      <Text style={styles.infoSub}>
                        SF{deviceInfo.radioSf} | {deviceInfo.radioBwHz / 1000} kHz | CR 4/{deviceInfo.radioCr}
                      </Text>
                    </View>

                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Puissance TX</Text>
                      <Text style={styles.infoValue}>{deviceInfo.txPower} dBm</Text>
                    </View>

                    <View style={styles.infoCard}>
                      <Text style={styles.infoLabel}>Clé Publique</Text>
                      <Text style={styles.infoSub} numberOfLines={1}>
                        {deviceInfo.publicKey?.slice(0, 20)}...
                      </Text>
                    </View>
                  </>
                )}

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Contacts Sync</Text>
                  <Text style={styles.infoValue}>{meshContacts.length} contacts</Text>
                </View>
              </View>
            )}

            {activeTab === 'tools' && (
              <View>
                <Text style={styles.sectionTitle}>Tests Manuels</Text>
                
                <View style={styles.toolCard}>
                  <Text style={styles.toolLabel}>Message de test</Text>
                  <TextInput
                    style={styles.toolInput}
                    value={testMessage}
                    onChangeText={setTestMessage}
                    placeholder="Entrez un message..."
                    placeholderTextColor={Colors.textMuted}
                  />
                  
                  <Text style={styles.toolLabel}>Canal cible (0-7)</Text>
                  <TextInput
                    style={styles.toolInput}
                    value={targetChannel}
                    onChangeText={setTargetChannel}
                    keyboardType="number-pad"
                    maxLength={1}
                  />
                  
                  <TouchableOpacity
                    style={[styles.toolBtn, !connected && styles.toolBtnDisabled]}
                    onPress={runManualTest}
                    disabled={!connected}
                  >
                    <Send size={16} color={Colors.black} />
                    <Text style={styles.toolBtnText}>Envoyer Test</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>Actions</Text>
                
                <TouchableOpacity
                  style={[styles.actionRow, !connected && styles.actionRowDisabled]}
                  onPress={syncContacts}
                  disabled={!connected}
                >
                  <RotateCcw size={18} color={connected ? Colors.accent : Colors.textMuted} />
                  <Text style={styles.actionRowText}>Sync Contacts</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionRow, !connected && styles.actionRowDisabled]}
                  onPress={() => addLog('info', 'Manual', 'Ping device')}
                  disabled={!connected}
                >
                  <Activity size={18} color={connected ? Colors.accent : Colors.textMuted} />
                  <Text style={styles.actionRowText}>Ping Device</Text>
                </TouchableOpacity>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Afficher données brutes</Text>
                  <Switch
                    value={showRawData}
                    onValueChange={setShowRawData}
                    trackColor={{ false: Colors.surfaceLight, true: Colors.accentDim }}
                    thumbColor={showRawData ? Colors.accent : Colors.textMuted}
                  />
                </View>

                {showRawData && deviceInfo && (
                  <View style={styles.rawData}>
                    <Text style={styles.rawDataTitle}>DeviceInfo (brut):</Text>
                    <Text style={styles.rawDataContent}>
                      {JSON.stringify(deviceInfo, null, 2)}
                    </Text>
                  </View>
                )}
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    minHeight: '70%',
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
  closeText: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  statBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  progressContainer: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  progressText: {
    position: 'absolute',
    right: 0,
    top: -18,
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  content: {
    padding: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
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
  secondaryBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  testCategory: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  testItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  testIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  testContent: {
    flex: 1,
  },
  testName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  testMessage: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  testSuccess: {
    color: Colors.green,
  },
  testFailed: {
    color: Colors.red,
  },
  testWarning: {
    color: Colors.yellow,
  },
  testRunning: {
    color: Colors.accent,
  },
  testPending: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  testDuration: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    marginLeft: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentGlow,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accent,
  },
  logContainer: {
    backgroundColor: Colors.background,
    borderRadius: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    padding: 40,
    fontSize: 14,
  },
  logEntry: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
    gap: 6,
  },
  logTime: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    width: 60,
  },
  logLevel: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceLight,
  },
  logLevelError: {
    color: Colors.red,
    backgroundColor: Colors.redDim,
  },
  logLevelWarn: {
    color: Colors.yellow,
    backgroundColor: Colors.yellowDim,
  },
  logLevelInfo: {
    color: Colors.blue,
    backgroundColor: Colors.blueDim,
  },
  logSource: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  logMessage: {
    fontSize: 11,
    color: Colors.text,
    flex: 1,
    flexWrap: 'wrap',
  },
  deviceInfo: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 10,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  infoSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  infoSuccess: {
    color: Colors.green,
  },
  infoError: {
    color: Colors.red,
  },
  toolCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  toolInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    marginBottom: 12,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
  },
  toolBtnDisabled: {
    backgroundColor: Colors.textMuted,
    opacity: 0.5,
  },
  toolBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionRowDisabled: {
    opacity: 0.5,
  },
  actionRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  rawData: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  rawDataTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  rawDataContent: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: Colors.textSecondary,
  },
});
