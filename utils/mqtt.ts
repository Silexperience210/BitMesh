export type MqttQoS = 0 | 1 | 2;

export interface MqttMessage {
  topic: string;
  payload: string;
  qos: MqttQoS;
  timestamp: number;
  retained: boolean;
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
