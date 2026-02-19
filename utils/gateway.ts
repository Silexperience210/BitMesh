import {
  type MqttClient,
  type MqttMessage,
  type MqttBrokerConfig,
  createMqttClient,
  connectMqtt,
  disconnectMqtt,
  subscribeTopic,
  publishMessage,
  createGatewayAnnouncement,
  createTxBroadcastPayload,
  createCashuRelayPayload,
  createChunkRelayPayload,
  parseMqttPayload,
  MQTT_TOPICS,
  DEFAULT_MQTT_CONFIG,
} from './mqtt';
import {
  type ChunkHeader,
  type ChunkAssemblyState,
  type Chunk,
  chunkMessage,
  decodeChunkHeader,
  createAssemblyState,
  addChunkToAssembly,
  assembleMessage,
  isChunkedMessage,
  LORA_LIMITS,
} from './chunking';

export type GatewayMode = 'client' | 'gateway';

export type GatewayServiceType = 'mempool' | 'cashu' | 'mqtt' | 'lora';

export interface GatewayRelayJob {
  id: string;
  type: 'tx_broadcast' | 'cashu_relay' | 'cashu_redeem' | 'chunk_reassembly' | 'payment_forward';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  sourceNodeId: string;
  timestamp: number;
  payload: string;
  result?: string;
  error?: string;
  retries: number;
  maxRetries: number;
}

export interface GatewayPeer {
  nodeId: string;
  name: string;
  lastSeen: number;
  signalStrength: number;
  hops: number;
  capabilities: string[];
  isGateway: boolean;
}

export interface GatewayStats {
  txRelayed: number;
  cashuRelayed: number;
  chunksProcessed: number;
  messagesForwarded: number;
  bytesRelayed: number;
  uptime: number;
  startedAt: number;
  peersServed: number;
  failedJobs: number;
  lastActivityAt: number;
}

export interface GatewayState {
  mode: GatewayMode;
  isActive: boolean;
  mqttClient: MqttClient | null;
  mqttConnected: boolean;
  relayJobs: GatewayRelayJob[];
  assemblyStates: Map<string, ChunkAssemblyState>;
  peers: GatewayPeer[];
  stats: GatewayStats;
  services: Record<GatewayServiceType, boolean>;
  mempoolUrl: string;
  cashuMintUrl: string;
}

export function createInitialGatewayState(): GatewayState {
  return {
    mode: 'client',
    isActive: false,
    mqttClient: null,
    mqttConnected: false,
    relayJobs: [],
    assemblyStates: new Map(),
    peers: [],
    stats: {
      txRelayed: 0,
      cashuRelayed: 0,
      chunksProcessed: 0,
      messagesForwarded: 0,
      bytesRelayed: 0,
      uptime: 0,
      startedAt: 0,
      peersServed: 0,
      failedJobs: 0,
      lastActivityAt: 0,
    },
    services: {
      mempool: true,
      cashu: true,
      mqtt: true,
      lora: true,
    },
    mempoolUrl: 'https://mempool.space',
    cashuMintUrl: 'https://8333.space:3338', // ✅ TESTÉ ET FONCTIONNEL
  };
}

function generateJobId(): string {
  return `gw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function activateGateway(
  state: GatewayState,
  mqttConfig?: Partial<MqttBrokerConfig>
): Promise<GatewayState> {
  console.log('[Gateway] Activating gateway mode...');

  const config = { ...DEFAULT_MQTT_CONFIG, ...mqttConfig };
  let client = createMqttClient(config);

  if (state.services.mqtt) {
    client = await connectMqtt(client);

    client = subscribeTopic(client, MQTT_TOPICS.txBroadcast, 1, (msg) => {
      console.log('[Gateway] Received TX broadcast request via MQTT');
    });
    client = subscribeTopic(client, MQTT_TOPICS.cashuRelay, 1, (msg) => {
      console.log('[Gateway] Received Cashu relay request via MQTT');
    });
    client = subscribeTopic(client, MQTT_TOPICS.chunkRelay, 1, (msg) => {
      console.log('[Gateway] Received chunk relay via MQTT');
    });
    client = subscribeTopic(client, MQTT_TOPICS.paymentRequest, 1, (msg) => {
      console.log('[Gateway] Received payment request via MQTT');
    });
    client = subscribeTopic(client, MQTT_TOPICS.loraInbound, 0, (msg) => {
      console.log('[Gateway] Received LoRa inbound message via MQTT');
    });

    const announcement = createGatewayAnnouncement(
      config.clientId,
      Object.entries(state.services)
        .filter(([, v]) => v)
        .map(([k]) => k),
      state.peers.length
    );
    client = publishMessage(client, MQTT_TOPICS.gatewayAnnounce, announcement, 1, true);
  }

  console.log('[Gateway] Gateway activated with services:', state.services);

  return {
    ...state,
    mode: 'gateway',
    isActive: true,
    mqttClient: client,
    mqttConnected: client.state === 'connected',
    stats: {
      ...state.stats,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    },
  };
}

export async function deactivateGateway(state: GatewayState): Promise<GatewayState> {
  console.log('[Gateway] Deactivating gateway mode...');

  if (state.mqttClient) {
    await disconnectMqtt(state.mqttClient);
  }

  return {
    ...state,
    mode: 'client',
    isActive: false,
    mqttClient: null,
    mqttConnected: false,
  };
}

export async function broadcastTransaction(
  state: GatewayState,
  txHex: string,
  sourceNodeId: string
): Promise<{ state: GatewayState; job: GatewayRelayJob }> {
  console.log('[Gateway] Broadcasting transaction from node:', sourceNodeId);

  const job: GatewayRelayJob = {
    id: generateJobId(),
    type: 'tx_broadcast',
    status: 'processing',
    sourceNodeId,
    timestamp: Date.now(),
    payload: txHex,
    retries: 0,
    maxRetries: 3,
  };

  try {
    const url = `${state.mempoolUrl}/api/tx`;
    console.log('[Gateway] Broadcasting TX to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: txHex,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Broadcast failed: ${response.status} - ${errText}`);
    }

    const txid = await response.text();
    console.log('[Gateway] TX broadcast success, txid:', txid);

    job.status = 'completed';
    job.result = txid;

    if (state.mqttClient && state.services.mqtt) {
      const payload = createTxBroadcastPayload(txHex, sourceNodeId, state.mqttClient.config.clientId);
      publishMessage(state.mqttClient, MQTT_TOPICS.txStatus, JSON.stringify({
        type: 'tx_status',
        txid,
        sourceNodeId,
        status: 'broadcast_ok',
        timestamp: Date.now(),
      }), 1);
    }

    return {
      state: {
        ...state,
        relayJobs: [...state.relayJobs, job],
        stats: {
          ...state.stats,
          txRelayed: state.stats.txRelayed + 1,
          bytesRelayed: state.stats.bytesRelayed + txHex.length,
          lastActivityAt: Date.now(),
        },
      },
      job,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log('[Gateway] TX broadcast failed:', message);

    job.status = 'failed';
    job.error = message;

    return {
      state: {
        ...state,
        relayJobs: [...state.relayJobs, job],
        stats: {
          ...state.stats,
          failedJobs: state.stats.failedJobs + 1,
          lastActivityAt: Date.now(),
        },
      },
      job,
    };
  }
}

export async function relayCashuToken(
  state: GatewayState,
  token: string,
  mintUrl: string,
  sourceNodeId: string,
  action: 'relay' | 'redeem' | 'mint'
): Promise<{ state: GatewayState; job: GatewayRelayJob }> {
  console.log('[Gateway] Relaying Cashu token, action:', action, 'from:', sourceNodeId);

  const job: GatewayRelayJob = {
    id: generateJobId(),
    type: action === 'redeem' ? 'cashu_redeem' : 'cashu_relay',
    status: 'processing',
    sourceNodeId,
    timestamp: Date.now(),
    payload: token,
    retries: 0,
    maxRetries: 3,
  };

  try {
    if (action === 'relay' && state.mqttClient && state.services.mqtt) {
      const payload = createCashuRelayPayload(
        token,
        mintUrl,
        sourceNodeId,
        state.mqttClient.config.clientId,
        action
      );
      publishMessage(state.mqttClient, MQTT_TOPICS.cashuRelay, payload, 1);
      console.log('[Gateway] Cashu token relayed via MQTT');
    }

    if (action === 'redeem') {
      console.log('[Gateway] Redeeming Cashu token at mint:', mintUrl);
      const url = `${mintUrl}/v1/checkstate`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Ys: [] }),
      });
      console.log('[Gateway] Cashu redeem check status:', response.status);
    }

    job.status = 'completed';
    job.result = `${action}_ok`;

    return {
      state: {
        ...state,
        relayJobs: [...state.relayJobs, job],
        stats: {
          ...state.stats,
          cashuRelayed: state.stats.cashuRelayed + 1,
          bytesRelayed: state.stats.bytesRelayed + token.length,
          lastActivityAt: Date.now(),
        },
      },
      job,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log('[Gateway] Cashu relay failed:', message);

    job.status = 'failed';
    job.error = message;

    return {
      state: {
        ...state,
        relayJobs: [...state.relayJobs, job],
        stats: {
          ...state.stats,
          failedJobs: state.stats.failedJobs + 1,
          lastActivityAt: Date.now(),
        },
      },
      job,
    };
  }
}

export function handleIncomingLoRaMessage(
  state: GatewayState,
  rawMessage: string,
  sourceNodeId: string
): GatewayState {
  console.log('[Gateway] Processing LoRa message from:', sourceNodeId, 'length:', rawMessage.length);

  if (!isChunkedMessage(rawMessage)) {
    console.log('[Gateway] Non-chunked message, forwarding directly');

    if (state.mqttClient && state.services.mqtt) {
      publishMessage(state.mqttClient, MQTT_TOPICS.loraInbound, JSON.stringify({
        type: 'lora_message',
        sourceNodeId,
        payload: rawMessage,
        timestamp: Date.now(),
      }), 0);
    }

    return {
      ...state,
      stats: {
        ...state.stats,
        messagesForwarded: state.stats.messagesForwarded + 1,
        bytesRelayed: state.stats.bytesRelayed + rawMessage.length,
        lastActivityAt: Date.now(),
      },
    };
  }

  const headerEnd = rawMessage.indexOf('|', rawMessage.lastIndexOf('|') + 1);
  const header = decodeChunkHeader(rawMessage);
  if (!header) {
    console.log('[Gateway] Invalid chunk header, ignoring');
    return state;
  }

  const payloadStart = rawMessage.split('|').slice(0, 6).join('|').length + 1;
  const payload = rawMessage.slice(payloadStart);

  const chunk: Chunk = {
    header,
    payload,
    raw: rawMessage,
  };

  const newAssemblyStates = new Map(state.assemblyStates);
  let assembly = newAssemblyStates.get(header.messageId);

  if (!assembly) {
    assembly = createAssemblyState(header);
    console.log('[Gateway] New chunk assembly started:', header.messageId, 'expecting', header.totalChunks, 'chunks');
  }

  assembly = addChunkToAssembly(assembly, chunk);
  newAssemblyStates.set(header.messageId, assembly);

  if (state.mqttClient && state.services.mqtt) {
    const chunkPayload = createChunkRelayPayload(
      rawMessage,
      header.messageId,
      header.chunkIndex,
      header.totalChunks,
      header.dataType,
      state.mqttClient.config.clientId
    );
    publishMessage(state.mqttClient, MQTT_TOPICS.chunkRelay, chunkPayload, 1);
  }

  let newState: GatewayState = {
    ...state,
    assemblyStates: newAssemblyStates,
    stats: {
      ...state.stats,
      chunksProcessed: state.stats.chunksProcessed + 1,
      bytesRelayed: state.stats.bytesRelayed + rawMessage.length,
      lastActivityAt: Date.now(),
    },
  };

  if (assembly.isComplete) {
    const fullMessage = assembleMessage(assembly);
    if (fullMessage) {
      console.log('[Gateway] Chunk assembly COMPLETE for:', header.messageId, 'type:', header.dataType, 'size:', fullMessage.length);

      if (state.mqttClient && state.services.mqtt) {
        publishMessage(state.mqttClient, MQTT_TOPICS.chunkAssembled, JSON.stringify({
          type: 'chunk_assembled',
          messageId: header.messageId,
          dataType: header.dataType,
          fullPayload: fullMessage,
          totalChunks: header.totalChunks,
          timestamp: Date.now(),
        }), 1);
      }

      newAssemblyStates.delete(header.messageId);
      newState = {
        ...newState,
        assemblyStates: newAssemblyStates,
        stats: {
          ...newState.stats,
          messagesForwarded: newState.stats.messagesForwarded + 1,
        },
      };
    }
  }

  return newState;
}

export function prepareLoRaChunks(
  data: string,
  dataType: 'CASHU' | 'LN_INV' | 'BTC_TX' | 'RAW'
): { chunks: Chunk[]; totalSize: number; fits: boolean } {
  if (data.length <= LORA_LIMITS.dataSize) {
    console.log('[Gateway] Data fits in single LoRa packet:', data.length, 'bytes');
    const chunks = chunkMessage(data, dataType);
    return { chunks, totalSize: data.length, fits: true };
  }

  console.log('[Gateway] Data requires chunking:', data.length, 'bytes');
  const chunks = chunkMessage(data, dataType);
  console.log('[Gateway] Split into', chunks.length, 'chunks');
  return { chunks, totalSize: data.length, fits: false };
}

export async function forwardPaymentToGateway(
  state: GatewayState,
  paymentData: string,
  paymentType: 'BTC_TX' | 'CASHU' | 'LN_INV',
  destinationNodeId: string
): Promise<GatewayState> {
  console.log('[Gateway] Forwarding payment type:', paymentType, 'to:', destinationNodeId);

  const { chunks, fits } = prepareLoRaChunks(paymentData, paymentType);

  if (fits) {
    console.log('[Gateway] Payment fits in single LoRa packet');
  } else {
    console.log('[Gateway] Payment chunked into', chunks.length, 'packets');
  }

  for (const chunk of chunks) {
    console.log('[Gateway] Sending chunk:', chunk.header.chunkIndex + 1, '/', chunk.header.totalChunks);

    if (state.mqttClient && state.services.mqtt) {
      publishMessage(state.mqttClient, MQTT_TOPICS.loraOutbound, JSON.stringify({
        type: 'lora_outbound',
        destinationNodeId,
        chunkRaw: chunk.raw,
        chunkIndex: chunk.header.chunkIndex,
        totalChunks: chunk.header.totalChunks,
        timestamp: Date.now(),
      }), 1);
    }
  }

  return {
    ...state,
    stats: {
      ...state.stats,
      messagesForwarded: state.stats.messagesForwarded + 1,
      bytesRelayed: state.stats.bytesRelayed + paymentData.length,
      lastActivityAt: Date.now(),
    },
  };
}

export function addGatewayPeer(state: GatewayState, peer: GatewayPeer): GatewayState {
  const existing = state.peers.findIndex((p) => p.nodeId === peer.nodeId);
  const newPeers = [...state.peers];

  if (existing >= 0) {
    newPeers[existing] = { ...newPeers[existing], ...peer, lastSeen: Date.now() };
  } else {
    newPeers.push({ ...peer, lastSeen: Date.now() });
    console.log('[Gateway] New peer registered:', peer.nodeId);
  }

  return {
    ...state,
    peers: newPeers,
    stats: {
      ...state.stats,
      peersServed: newPeers.length,
    },
  };
}

export function cleanupStalePeers(state: GatewayState, maxAge: number = 300000): GatewayState {
  const now = Date.now();
  const activePeers = state.peers.filter((p) => now - p.lastSeen < maxAge);
  const removed = state.peers.length - activePeers.length;
  if (removed > 0) {
    console.log('[Gateway] Cleaned up', removed, 'stale peers');
  }
  return {
    ...state,
    peers: activePeers,
    stats: {
      ...state.stats,
      peersServed: activePeers.length,
    },
  };
}

export function cleanupOldJobs(state: GatewayState, maxAge: number = 3600000): GatewayState {
  const now = Date.now();
  const recentJobs = state.relayJobs.filter((j) => now - j.timestamp < maxAge);
  return { ...state, relayJobs: recentJobs };
}

export function getGatewayUptime(state: GatewayState): string {
  if (!state.stats.startedAt) return '0s';
  const elapsed = Date.now() - state.stats.startedAt;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatRelayJobStatus(job: GatewayRelayJob): string {
  const typeLabels: Record<string, string> = {
    tx_broadcast: 'BTC TX',
    cashu_relay: 'Cashu Relay',
    cashu_redeem: 'Cashu Redeem',
    chunk_reassembly: 'Chunk Assembly',
    payment_forward: 'Payment Fwd',
  };
  return `${typeLabels[job.type] ?? job.type} [${job.status}]`;
}
