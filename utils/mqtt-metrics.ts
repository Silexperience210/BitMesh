/**
 * Métriques MQTT pour debugging et monitoring
 * 
 * Stats: envoi, réception, erreurs, latence
 */

interface MqttMetrics {
  messagesSent: number;
  messagesReceived: number;
  messagesFailed: number;
  bytesSent: number;
  bytesReceived: number;
  connectionAttempts: number;
  connectionFailures: number;
  lastConnectedAt: number | null;
  averageLatency: number;
}

let metrics: MqttMetrics = {
  messagesSent: 0,
  messagesReceived: 0,
  messagesFailed: 0,
  bytesSent: 0,
  bytesReceived: 0,
  connectionAttempts: 0,
  connectionFailures: 0,
  lastConnectedAt: null,
  averageLatency: 0,
};

const latencySamples: number[] = [];
const MAX_SAMPLES = 100;

export const mqttMetrics = {
  // Incrémenter compteurs
  incrementSent: (bytes: number) => {
    metrics.messagesSent++;
    metrics.bytesSent += bytes;
  },
  
  incrementReceived: (bytes: number) => {
    metrics.messagesReceived++;
    metrics.bytesReceived += bytes;
  },
  
  incrementFailed: () => {
    metrics.messagesFailed++;
  },
  
  incrementConnectionAttempt: () => {
    metrics.connectionAttempts++;
  },
  
  incrementConnectionFailure: () => {
    metrics.connectionFailures++;
  },
  
  // Latence
  recordLatency: (ms: number) => {
    latencySamples.push(ms);
    if (latencySamples.length > MAX_SAMPLES) {
      latencySamples.shift();
    }
    metrics.averageLatency = 
      latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length;
  },
  
  recordConnected: () => {
    metrics.lastConnectedAt = Date.now();
  },
  
  // Getters
  getMetrics: (): MqttMetrics => ({ ...metrics }),
  
  getSuccessRate: (): number => {
    const total = metrics.messagesSent + metrics.messagesFailed;
    return total > 0 ? (metrics.messagesSent / total) * 100 : 100;
  },
  
  // Reset
  reset: () => {
    metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesFailed: 0,
      bytesSent: 0,
      bytesReceived: 0,
      connectionAttempts: 0,
      connectionFailures: 0,
      lastConnectedAt: metrics.lastConnectedAt,
      averageLatency: 0,
    };
    latencySamples.length = 0;
  },
  
  // Format pour affichage
  toString: (): string => {
    return `
📊 MQTT Metrics:
  Messages: ${metrics.messagesSent} sent, ${metrics.messagesReceived} received, ${metrics.messagesFailed} failed
  Success rate: ${mqttMetrics.getSuccessRate().toFixed(1)}%
  Bytes: ${(metrics.bytesSent / 1024).toFixed(1)}KB sent, ${(metrics.bytesReceived / 1024).toFixed(1)}KB received
  Connections: ${metrics.connectionAttempts} attempts, ${metrics.connectionFailures} failures
  Avg latency: ${metrics.averageLatency.toFixed(0)}ms
  Last connected: ${metrics.lastConnectedAt ? new Date(metrics.lastConnectedAt).toLocaleTimeString() : 'never'}
    `.trim();
  },
};

export default mqttMetrics;
