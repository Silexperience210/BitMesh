/**
 * Écran Debug Mesh - Diagnostics complets
 * 
 * Route: /mesh/debug
 * Accessible via: Mesh → Menu Debug ou Shake Gesture
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Clipboard,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Terminal,
  Play,
  RotateCcw,
  Share2,
  Copy,
  Trash2,
  ChevronLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Wifi,
  Bluetooth,
  Radio,
  Send,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import MeshDebugger from '@/components/MeshDebugger';
import { useMeshDiagnostics, DiagnosticTest } from '@/hooks/useMeshDiagnostics';
import { useBle } from '@/providers/BleProvider';

export default function MeshDebugScreen() {
  const router = useRouter();
  const [showDebugger, setShowDebugger] = useState(false);
  const [lastResult, setLastResult] = useState<ReturnType<typeof useMeshDiagnostics>['tests']>([]);
  
  const {
    connected,
    device,
    deviceInfo,
    currentChannel,
    channelConfigured,
    meshContacts,
  } = useBle();

  const {
    isRunningDiagnostics,
    tests,
    stats,
    runAllDiagnostics,
    quickHealthCheck,
    resetStats,
  } = useMeshDiagnostics();

  // Sauvegarder les résultats
  useEffect(() => {
    if (tests.length > 0 && !isRunningDiagnostics) {
      setLastResult(tests);
    }
  }, [tests, isRunningDiagnostics]);

  // Lancer les diagnostics
  const handleRunDiagnostics = async () => {
    Vibration.vibrate(50);
    const result = await runAllDiagnostics();
    
    if (result.failed === 0 && result.warnings === 0) {
      Alert.alert(
        '✅ Tous les tests passent',
        `${result.passed}/${result.total} tests réussis\nVotre configuration MeshCore est optimale!`
      );
    } else if (result.failed > 0) {
      Alert.alert(
        '❌ Certains tests ont échoué',
        `${result.failed} échecs, ${result.warnings} avertissements\nConsultez les détails pour plus d'informations.`
      );
    } else {
      Alert.alert(
        '⚠️ Quelques avertissements',
        `${result.warnings} avertissements\nVotre configuration fonctionne mais pourrait être améliorée.`
      );
    }
  };

  // Quick check
  const handleQuickCheck = async () => {
    Vibration.vibrate(50);
    const isHealthy = await quickHealthCheck();
    
    if (isHealthy) {
      Alert.alert('✅ Santé OK', 'Les fonctions critiques fonctionnent correctement.');
    } else {
      Alert.alert('❌ Problème détecté', 'Certaines fonctions critiques ne fonctionnent pas.');
    }
  };

  // Exporter le rapport
  const handleExportReport = async () => {
    const report = generateReport();
    
    try {
      await Share.share({
        message: report,
        title: 'Rapport Diagnostic BitMesh',
      });
    } catch (err) {
      // Fallback: copier dans le presse-papier
      await Clipboard.setString(report);
      Alert.alert('📋 Rapport copié', 'Le rapport a été copié dans le presse-papier');
    }
  };

  // Générer le rapport texte
  const generateReport = () => {
    const results = lastResult.length > 0 ? lastResult : tests;
    
    let report = `=== RAPPORT DIAGNOSTIC BITMESH ===\n`;
    report += `Date: ${new Date().toLocaleString()}\n`;
    report += `Version: ${deviceInfo?.name || 'N/A'}\n\n`;
    
    report += `=== STATUT GLOBAL ===\n`;
    report += `Connexion BLE: ${connected ? '✅ Connecté' : '❌ Déconnecté'}\n`;
    report += `Canal actif: ${currentChannel} ${channelConfigured ? '✅' : '⚠️'}\n`;
    report += `Contacts: ${meshContacts.length}\n`;
    report += `Messages envoyés: ${stats.messagesSent}\n`;
    report += `Latence moyenne: ${stats.avgLatency}ms\n\n`;
    
    if (deviceInfo) {
      report += `=== PARAMÈTRES RADIO ===\n`;
      report += `Fréquence: ${(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz\n`;
      report += `SF: ${deviceInfo.radioSf}\n`;
      report += `BW: ${deviceInfo.radioBwHz / 1000} kHz\n`;
      report += `CR: 4/${deviceInfo.radioCr}\n`;
      report += `TX Power: ${deviceInfo.txPower} dBm\n\n`;
    }
    
    report += `=== RÉSULTATS DES TESTS ===\n`;
    results.forEach((test) => {
      const icon = test.status === 'success' ? '✅' : test.status === 'failed' ? '❌' : '⚠️';
      report += `${icon} ${test.name}: ${test.message}\n`;
    });
    
    return report;

  };

  // Obtenir les résultats à afficher
  const displayResults = lastResult.length > 0 ? lastResult : tests;
  
  // Grouper par catégorie
  const groupedTests = displayResults.reduce((acc, test) => {
    if (!acc[test.category]) acc[test.category] = [];
    acc[test.category].push(test);
    return acc;
  }, {} as Record<string, DiagnosticTest[]>);

  const categoryNames = {
    connection: '🔗 Connexion',
    radio: '📡 Radio',
    messaging: '💬 Messagerie',
    protocol: '⚙️ Protocole',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Terminal size={20} color={Colors.accent} />
          <Text style={styles.headerTitle}>Diagnostics Mesh</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIndicator, connected ? styles.statusOk : styles.statusError]} />
            <View>
              <Text style={styles.statusTitle}>
                {connected ? 'Connecté' : 'Déconnecté'}
              </Text>
              <Text style={styles.statusSubtitle}>
                {device?.name || 'Aucun device'}
              </Text>
            </View>
          </View>
          
          {deviceInfo && (
            <View style={styles.radioInfo}>
              <Text style={styles.radioText}>
                {(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz · SF{deviceInfo.radioSf} · Ch{currentChannel}
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity 
            style={[styles.actionCard, isRunningDiagnostics && styles.actionCardDisabled]}
            onPress={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.accentGlow }]}>
              <Play size={24} color={Colors.accent} />
            </View>
            <Text style={styles.actionTitle}>Test Complet</Text>
            <Text style={styles.actionSubtitle}>
              {isRunningDiagnostics ? 'En cours...' : '10 tests'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleQuickCheck}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.greenDim }]}>
              <Activity size={24} color={Colors.green} />
            </View>
            <Text style={styles.actionTitle}>Quick Check</Text>
            <Text style={styles.actionSubtitle}>Santé rapide</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => setShowDebugger(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.blueDim }]}>
              <Terminal size={24} color={Colors.blue} />
            </View>
            <Text style={styles.actionTitle}>Debugger</Text>
            <Text style={styles.actionSubtitle}>Avancé</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleExportReport}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.purpleDim }]}>
              <Share2 size={24} color={Colors.purple} />
            </View>
            <Text style={styles.actionTitle}>Exporter</Text>
            <Text style={styles.actionSubtitle}>Rapport</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Statistiques Session</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.messagesSent}</Text>
              <Text style={styles.statLabel}>Envoyés</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.messagesReceived}</Text>
              <Text style={styles.statLabel}>Reçus</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.avgLatency}ms</Text>
              <Text style={styles.statLabel}>Latence</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{meshContacts.length}</Text>
              <Text style={styles.statLabel}>Contacts</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.resetBtn} onPress={resetStats}>
            <RotateCcw size={14} color={Colors.textMuted} />
            <Text style={styles.resetText}>Reset stats</Text>
          </TouchableOpacity>
        </View>

        {/* Résultats des tests */}
        {displayResults.length > 0 && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>Derniers Résultats</Text>
            
            {Object.entries(groupedTests).map(([category, categoryTests]) => (
              <View key={category} style={styles.categoryCard}>
                <Text style={styles.categoryTitle}>
                  {categoryNames[category as keyof typeof categoryNames] || category}
                </Text>
                
                {categoryTests.map((test) => (
                  <View key={test.id} style={styles.testRow}>
                    {test.status === 'success' && <CheckCircle size={18} color={Colors.green} />}
                    {test.status === 'failed' && <XCircle size={18} color={Colors.red} />}
                    {test.status === 'warning' && <AlertTriangle size={18} color={Colors.yellow} />}
                    
                    <View style={styles.testInfo}>
                      <Text style={styles.testName}>{test.name}</Text>
                      <Text style={styles.testMessage}>{test.message}</Text>
                    </View>
                    
                    {test.duration && (
                      <Text style={styles.testDuration}>{test.duration}ms</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Info device */}
        {deviceInfo && (
          <View style={styles.deviceSection}>
            <Text style={styles.sectionTitle}>Informations Device</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nom</Text>
                <Text style={styles.infoValue}>{deviceInfo.name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fréquence</Text>
                <Text style={styles.infoValue}>
                  {(deviceInfo.radioFreqHz / 1e6).toFixed(3)} MHz
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>SF / BW / CR</Text>
                <Text style={styles.infoValue}>
                  {deviceInfo.radioSf} / {deviceInfo.radioBwHz / 1000}k / 4/{deviceInfo.radioCr}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>TX Power</Text>
                <Text style={styles.infoValue}>{deviceInfo.txPower} dBm</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Clé Publique</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {deviceInfo.publicKey.slice(0, 16)}...
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Espace en bas */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal Debugger */}
      <MeshDebugger 
        visible={showDebugger} 
        onClose={() => setShowDebugger(false)} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusOk: {
    backgroundColor: Colors.green,
    shadowColor: Colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  statusError: {
    backgroundColor: Colors.red,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  statusSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  radioInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  radioText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionCardDisabled: {
    opacity: 0.6,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  statsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 4,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  resultsSection: {
    marginBottom: 20,
  },
  categoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  testInfo: {
    flex: 1,
  },
  testName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  testMessage: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  testDuration: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  deviceSection: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '40',
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    fontFamily: 'monospace',
  },
});
