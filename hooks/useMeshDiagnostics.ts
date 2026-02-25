/**
 * useMeshDiagnostics - Hook de diagnostic pour BitMesh
 * 
 * Fournit des fonctions de test et monitoring pour le réseau MeshCore
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useBle } from '@/providers/BleProvider';

export type TestStatus = 'idle' | 'running' | 'success' | 'failed' | 'warning';

export interface DiagnosticTest {
  id: string;
  name: string;
  description: string;
  category: 'connection' | 'radio' | 'messaging' | 'protocol';
  status: TestStatus;
  message?: string;
  duration?: number;
  timestamp?: number;
  error?: string;
}

export interface DiagnosticResult {
  passed: number;
  failed: number;
  warnings: number;
  total: number;
  tests: DiagnosticTest[];
  timestamp: number;
}

export interface MeshStats {
  messagesSent: number;
  messagesReceived: number;
  ackReceived: number;
  ackTimeout: number;
  connectionDrops: number;
  lastActivity: number;
  avgLatency: number;
}

export function useMeshDiagnostics() {
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

  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [tests, setTests] = useState<DiagnosticTest[]>([]);
  const [stats, setStats] = useState<MeshStats>({
    messagesSent: 0,
    messagesReceived: 0,
    ackReceived: 0,
    ackTimeout: 0,
    connectionDrops: 0,
    lastActivity: 0,
    avgLatency: 0,
  });
  
  const latencyHistory = useRef<number[]>([]);
  const startTime = useRef<number>(0);

  // Liste des tests disponibles
  const availableTests: Omit<DiagnosticTest, 'status' | 'timestamp'>[] = [
    {
      id: 'ble_connection',
      name: 'Connexion BLE',
      description: 'Vérifie la connexion au device MeshCore',
      category: 'connection',
    },
    {
      id: 'protocol_handshake',
      name: 'Handshake Protocole',
      description: 'Vérifie le handshake MeshCore Companion',
      category: 'connection',
    },
    {
      id: 'self_info',
      name: 'SelfInfo Device',
      description: 'Récupère les informations du device',
      category: 'connection',
    },
    {
      id: 'channel_config',
      name: 'Configuration Canal',
      description: 'Vérifie la configuration du canal actif',
      category: 'radio',
    },
    {
      id: 'radio_params',
      name: 'Paramètres Radio',
      description: 'Vérifie la fréquence, SF, BW, CR',
      category: 'radio',
    },
    {
      id: 'send_capability',
      name: 'Capacité Envoi',
      description: 'Teste l\'envoi de message',
      category: 'messaging',
    },
    {
      id: 'receive_capability',
      name: 'Capacité Réception',
      description: 'Vérifie la réception de messages',
      category: 'messaging',
    },
    {
      id: 'ack_mechanism',
      name: 'Mécanisme ACK',
      description: 'Teste les accusés de réception',
      category: 'messaging',
    },
    {
      id: 'broadcast_flood',
      name: 'Broadcast Flood',
      description: 'Teste le broadcast sur canal 0',
      category: 'protocol',
    },
    {
      id: 'contacts_sync',
      name: 'Sync Contacts',
      description: 'Vérifie la synchronisation des contacts',
      category: 'protocol',
    },
  ];

  // Exécuter un test individuel
  const runTest = useCallback(async (testId: string): Promise<DiagnosticTest> => {
    const testBase = availableTests.find((t) => t.id === testId);
    if (!testBase) {
      return {
        ...testBase!,
        id: testId,
        name: 'Test inconnu',
        description: '',
        category: 'connection',
        status: 'failed',
        message: 'Test non trouvé',
        timestamp: Date.now(),
      };
    }

    startTime.current = Date.now();
    
    const updateTest = (updates: Partial<DiagnosticTest>) => {
      setTests((prev) => {
        const index = prev.findIndex((t) => t.id === testId);
        if (index >= 0) {
          const newTests = [...prev];
          newTests[index] = { ...newTests[index], ...updates };
          return newTests;
        }
        return [...prev, { ...testBase, ...updates, timestamp: Date.now() } as DiagnosticTest];
      });
    };

    // Marquer comme running
    updateTest({ status: 'running', message: 'En cours...' });

    try {
      let result: DiagnosticTest;

      switch (testId) {
        case 'ble_connection':
          result = {
            ...testBase,
            status: connected ? 'success' : 'failed',
            message: connected 
              ? `Connecté à ${device?.name || 'device'}` 
              : 'Non connecté',
            duration: Date.now() - startTime.current,
            timestamp: Date.now(),
          };
          break;

        case 'protocol_handshake':
          if (!connected) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'Connexion BLE requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else if (!deviceInfo) {
            result = {
              ...testBase,
              status: 'warning',
              message: 'Connecté mais handshake incomplet',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            result = {
              ...testBase,
              status: 'success',
              message: 'Handshake MeshCore OK',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          }
          break;

        case 'self_info':
          if (!deviceInfo) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'SelfInfo non disponible',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            result = {
              ...testBase,
              status: 'success',
              message: `${deviceInfo.name} | ${(deviceInfo.radioFreqHz / 1e6).toFixed(2)}MHz`,
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          }
          break;

        case 'channel_config':
          if (!connected) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'Connexion requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else if (channelConfigured) {
            result = {
              ...testBase,
              status: 'success',
              message: `Canal ${currentChannel} configuré`,
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            result = {
              ...testBase,
              status: 'warning',
              message: `Canal ${currentChannel} actif, config non confirmée`,
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          }
          break;

        case 'radio_params':
          if (!deviceInfo) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'SelfInfo requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            result = {
              ...testBase,
              status: 'success',
              message: `SF${deviceInfo.radioSf} / ${deviceInfo.radioBwHz / 1000}kHz / ${deviceInfo.txPower}dBm`,
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          }
          break;

        case 'send_capability':
          if (!connected) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'Connexion requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            try {
              await sendChannelMessage('Test diagnostic');
              setStats((s) => ({ ...s, messagesSent: s.messagesSent + 1 }));
              result = {
                ...testBase,
                status: 'success',
                message: 'Message envoyé avec succès',
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            } catch (err: any) {
              result = {
                ...testBase,
                status: 'failed',
                message: err.message || 'Échec envoi',
                error: err.message,
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            }
          }
          break;

        case 'broadcast_flood':
          if (!connected) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'Connexion requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            try {
              const beforeSend = Date.now();
              await sendFloodMessage('Test broadcast diagnostic');
              const latency = Date.now() - beforeSend;
              latencyHistory.current.push(latency);
              
              setStats((s) => ({ 
                ...s, 
                messagesSent: s.messagesSent + 1,
                lastActivity: Date.now(),
              }));
              
              result = {
                ...testBase,
                status: 'success',
                message: `Broadcast envoyé (${latency}ms)`,
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            } catch (err: any) {
              result = {
                ...testBase,
                status: 'failed',
                message: err.message || 'Échec broadcast',
                error: err.message,
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            }
          }
          break;

        case 'contacts_sync':
          if (!connected) {
            result = {
              ...testBase,
              status: 'failed',
              message: 'Connexion requise',
              duration: Date.now() - startTime.current,
              timestamp: Date.now(),
            };
          } else {
            try {
              await syncContacts();
              result = {
                ...testBase,
                status: 'success',
                message: `${meshContacts.length} contacts synchronisés`,
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            } catch (err: any) {
              result = {
                ...testBase,
                status: 'warning',
                message: 'Sync peut nécessiter un retry',
                error: err.message,
                duration: Date.now() - startTime.current,
                timestamp: Date.now(),
              };
            }
          }
          break;

        default:
          result = {
            ...testBase,
            status: 'failed',
            message: 'Test non implémenté',
            duration: Date.now() - startTime.current,
            timestamp: Date.now(),
          };
      }

      updateTest(result);
      return result;
    } catch (err: any) {
      const result: DiagnosticTest = {
        ...testBase,
        status: 'failed',
        message: err.message || 'Erreur inattendue',
        error: err.message,
        duration: Date.now() - startTime.current,
        timestamp: Date.now(),
      };
      updateTest(result);
      return result;
    }
  }, [connected, device, deviceInfo, currentChannel, channelConfigured, meshContacts, sendChannelMessage, sendFloodMessage, syncContacts]);

  // Exécuter tous les tests
  const runAllDiagnostics = useCallback(async (): Promise<DiagnosticResult> => {
    setIsRunningDiagnostics(true);
    setTests([]);
    
    const results: DiagnosticTest[] = [];
    
    for (const test of availableTests) {
      const result = await runTest(test.id);
      results.push(result);
      
      // Petit délai pour l'UI
      await new Promise((r) => setTimeout(r, 200));
    }
    
    setIsRunningDiagnostics(false);
    
    // Calculer les stats
    const passed = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const warnings = results.filter((r) => r.status === 'warning').length;
    
    // Mettre à jour la latence moyenne
    if (latencyHistory.current.length > 0) {
      const avg = latencyHistory.current.reduce((a, b) => a + b, 0) / latencyHistory.current.length;
      setStats((s) => ({ ...s, avgLatency: Math.round(avg) }));
    }
    
    return {
      passed,
      failed,
      warnings,
      total: results.length,
      tests: results,
      timestamp: Date.now(),
    };
  }, [runTest]);

  // Quick health check
  const quickHealthCheck = useCallback(async (): Promise<boolean> => {
    const criticalTests = ['ble_connection', 'protocol_handshake', 'channel_config'];
    
    for (const testId of criticalTests) {
      const result = await runTest(testId);
      if (result.status === 'failed') {
        return false;
      }
    }
    
    return true;
  }, [runTest]);

  // Reset stats
  const resetStats = useCallback(() => {
    setStats({
      messagesSent: 0,
      messagesReceived: 0,
      ackReceived: 0,
      ackTimeout: 0,
      connectionDrops: 0,
      lastActivity: 0,
      avgLatency: 0,
    });
    latencyHistory.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsRunningDiagnostics(false);
    };
  }, []);

  return {
    isRunningDiagnostics,
    tests,
    stats,
    availableTests,
    runTest,
    runAllDiagnostics,
    quickHealthCheck,
    resetStats,
    setTests,
  };
}

export default useMeshDiagnostics;
