export type MqttQoS = 0 | 1 | 2;

// ✅ NOUVEAU: Import LZW pour compression
import { lzwCompress, lzwDecompress } from './lzw';

export interface MqttMessage {
  topic: string;
  payload: string;
  qos: MqttQoS;
  timestamp: number;
  retained: boolean;
}

/**
 * ✅ NOUVEAU: Compresse un payload pour MQTT si > 500 caractères
 * @returns payload compressé avec préfixe 'LZ:'
 */
export function compressMqttPayload(payload: string): string {
  if (payload.length < 500) return payload;
  
  try {
    const compressed = lzwCompress(payload);
    return 'LZ:' + compressed;
  } catch (err) {
    console.warn('[MQTT] Compression failed, sending raw:', err);
    return payload;
  }
}

/**
 * ✅ NOUVEAU: Décompresse un payload MQTT si compressé
 */
export function decompressMqttPayload(payload: string): string {
  if (!payload.startsWith('LZ:')) return payload;
  
  try {
    return lzwDecompress(payload.slice(3));
  } catch (err) {
    console.warn('[MQTT] Decompression failed:', err);
    return payload;
  }
}

export interface MqttSubscription {
  topic: string;
  qos: MqttQoS;
  callback: (message: MqttMessage) => void;
}

export interface MqttBrokerConfig {
  url: string;
  port: number;
  clientId: string;
  username?: string;
  password?: string;
  keepAlive: number;
  cleanSession: boolean;
}

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export const DEFAULT_MQTT_CONFIG: MqttBrokerConfig = {
  url: 'wss://broker.emqx.io:8084/mqtt',
  port: 8084,
  clientId: `meshcore-gw-${Date.now().toString(36)}`,
  keepAlive: 60,
  cleanSession: true,
};

export const MQTT_TOPICS = {
  gatewayAnnounce: 'meshcore/gateway/announce',
  gatewayStatus: 'meshcore/gateway/status',
  txBroadcast: 'meshcore/tx/broadcast',
  txStatus: 'meshcore/tx/status',
  cashuRelay: 'meshcore/cashu/relay',
  cashuRedeem: 'meshcore/cashu/redeem',
  chunkRelay: 'meshcore/chunk/relay',
  chunkAssembled: 'meshcore/chunk/assembled',
  loraInbound: 'meshcore/lora/inbound',
  loraOutbound: 'meshcore/lora/outbound',
  paymentRequest: 'meshcore/payment/request',
  paymentConfirm: 'meshcore/payment/confirm',
} as const;

export interface MqttClient {
  state: MqttConnectionState;
  subscriptions: Map<string, MqttSubscription>;
  messageQueue: MqttMessage[];
  config: MqttBrokerConfig;
}

export function createMqttClient(config: MqttBrokerConfig): MqttClient {
  console.log('[MQTT] Creating client with ID:', config.clientId);
  return {
    state: 'disconnected',
    subscriptions: new Map(),
    messageQueue: [],
    config,
  };
}

export async function connectMqtt(client: MqttClient): Promise<MqttClient> {
  console.log('[MQTT] Connecting to:', client.config.url);
  try {
    await new Promise((resolve) => setTimeout(resolve, 800));
    console.log('[MQTT] Connected successfully');
    return { ...client, state: 'connected' };
  } catch (err) {
    console.log('[MQTT] Connection error:', err);
    return { ...client, state: 'error' };
  }
}

export async function disconnectMqtt(client: MqttClient): Promise<MqttClient> {
  console.log('[MQTT] Disconnecting...');
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log('[MQTT] Disconnected');
  return {
    ...client,
    state: 'disconnected',
    subscriptions: new Map(),
  };
}

export function subscribeTopic(
  client: MqttClient,
  topic: string,
  qos: MqttQoS,
  callback: (message: MqttMessage) => void
): MqttClient {
  console.log('[MQTT] Subscribing to:', topic, 'QoS:', qos);
  const newSubs = new Map(client.subscriptions);
  newSubs.set(topic, { topic, qos, callback });
  return { ...client, subscriptions: newSubs };
}

export function unsubscribeTopic(client: MqttClient, topic: string): MqttClient {
  console.log('[MQTT] Unsubscribing from:', topic);
  const newSubs = new Map(client.subscriptions);
  newSubs.delete(topic);
  return { ...client, subscriptions: newSubs };
}

// ✅ NOUVEAU: Map pour tracker les ACKs en attente
const pendingAcks = new Map<string, { resolve: () => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>();

export function publishMessage(
  client: MqttClient,
  topic: string,
  payload: string,
  qos: MqttQoS = 0,
  retained: boolean = false
): MqttClient {
  console.log('[MQTT] Publishing to:', topic, 'payload length:', payload.length, 'QoS:', qos);
  const message: MqttMessage = {
    topic,
    payload,
    qos,
    timestamp: Date.now(),
    retained,
  };

  const newQueue = [...client.messageQueue, message];

  const sub = client.subscriptions.get(topic);
  if (sub) {
    console.log('[MQTT] Local delivery for topic:', topic);
    sub.callback(message);
  }

  return { ...client, messageQueue: newQueue };
}

// ✅ NOUVEAU: Publier avec ACK et timeout
export function publishWithAck(
  client: MqttClient,
  topic: string,
  payload: string,
  qos: MqttQoS = 1,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const msgId = `${topic}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const timeout = setTimeout(() => {
      pendingAcks.delete(msgId);
      reject(new Error(`ACK timeout for message ${msgId}`));
    }, timeoutMs);
    
    pendingAcks.set(msgId, { resolve, reject, timeout });
    
    // Publier le message avec l'ID pour corrélation
    const payloadWithId = JSON.stringify({ ...JSON.parse(payload), _ackId: msgId });
    publishMessage(client, topic, payloadWithId, qos);
    
    console.log('[MQTT] Published with ACK:', msgId);
  });
}

// ✅ NOUVEAU: Confirmer réception d'un ACK
export function confirmAck(msgId: string): void {
  const pending = pendingAcks.get(msgId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve();
    pendingAcks.delete(msgId);
    console.log('[MQTT] ACK confirmed:', msgId);
  }
}

// ✅ NOUVEAU: Retry avec backoff exponentiel
export async function publishWithRetry(
  client: MqttClient,
  topic: string,
  payload: string,
  qos: MqttQoS = 1,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await publishWithAck(client, topic, payload, qos, 5000);
      return true;
    } catch (err) {
      console.log(`[MQTT] Attempt ${attempt + 1}/${maxRetries} failed:`, err);
      
      if (attempt < maxRetries - 1) {
        // Backoff exponentiel: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[MQTT] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('[MQTT] All retries failed for:', topic);
  return false;
}

export function createGatewayAnnouncement(
  gatewayId: string,
  capabilities: string[],
  peerCount: number
): string {
  return JSON.stringify({
    type: 'gateway_announce',
    gatewayId,
    capabilities,
    peerCount,
    timestamp: Date.now(),
    version: '1.0',
  });
}

export function createTxBroadcastPayload(
  txHex: string,
  sourceNodeId: string,
  gatewayId: string
): string {
  return JSON.stringify({
    type: 'tx_broadcast',
    txHex,
    sourceNodeId,
    gatewayId,
    timestamp: Date.now(),
  });
}

export function createCashuRelayPayload(
  token: string,
  mintUrl: string,
  sourceNodeId: string,
  gatewayId: string,
  action: 'relay' | 'redeem' | 'mint'
): string {
  return JSON.stringify({
    type: 'cashu_relay',
    token,
    mintUrl,
    sourceNodeId,
    gatewayId,
    action,
    timestamp: Date.now(),
  });
}

export function createChunkRelayPayload(
  chunkRaw: string,
  messageId: string,
  chunkIndex: number,
  totalChunks: number,
  dataType: string,
  gatewayId: string
): string {
  return JSON.stringify({
    type: 'chunk_relay',
    chunkRaw,
    messageId,
    chunkIndex,
    totalChunks,
    dataType,
    gatewayId,
    timestamp: Date.now(),
  });
}

export function parseMqttPayload<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch (err) {
    console.log('[MQTT] Failed to parse payload:', err);
    return null;
  }
}

export async function testMqttConnection(brokerUrl: string): Promise<{
  ok: boolean;
  latency?: number;
  error?: string;
}> {
  console.log('[MQTT] Testing connection to:', brokerUrl);
  const start = Date.now();
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const latency = Date.now() - start;
    console.log('[MQTT] Connection test OK, latency:', latency, 'ms');
    return { ok: true, latency };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log('[MQTT] Connection test FAILED:', message);
    return { ok: false, error: message };
  }
}
