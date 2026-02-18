// Vrai client MQTT WebSocket pour messagerie P2P MeshCore
import mqtt, { MqttClient as MqttJsClient, IClientOptions } from 'mqtt';

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type MessageHandler = (topic: string, payload: string) => void;

const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

// Topics MeshCore
export const TOPICS = {
  identity: (nodeId: string) => `meshcore/identity/${nodeId}`,
  dm: (nodeId: string) => `meshcore/dm/${nodeId}`,
  forum: (channelId: string) => `meshcore/forum/${channelId}`,
  loraInbound: 'meshcore/lora/inbound',
  loraOutbound: 'meshcore/lora/outbound',
  gatewayAnnounce: 'meshcore/gateway/announce',
} as const;

export interface MeshMqttClient {
  client: MqttJsClient | null;
  state: MqttConnectionState;
  nodeId: string;
  handlers: Map<string, MessageHandler[]>;
  // Handlers pour patterns MQTT à un niveau (ex: "meshcore/identity/+")
  patternHandlers: Map<string, MessageHandler[]>;
}

// Créer et connecter un client MQTT réel
export function createMeshMqttClient(
  nodeId: string,
  pubkeyHex: string,
  brokerUrl: string = DEFAULT_BROKER
): MeshMqttClient {
  const instance: MeshMqttClient = {
    client: null,
    state: 'disconnected',
    nodeId,
    handlers: new Map(),
    patternHandlers: new Map(),
  };

  const options: IClientOptions = {
    clientId: `meshcore-${nodeId}-${Date.now().toString(36)}`,
    keepalive: 60,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    will: {
      topic: TOPICS.identity(nodeId),
      payload: JSON.stringify({ nodeId, pubkeyHex, online: false }),
      qos: 1,
      retain: true,
    },
  };

  console.log('[MQTT] Connexion à:', brokerUrl, 'nodeId:', nodeId);
  instance.state = 'connecting';

  try {
    // React Native utilise WebSocket natif avec les URLs wss://
    const client = mqtt.connect(brokerUrl, options);
    instance.client = client;

    client.on('connect', () => {
      console.log('[MQTT] Connecté! nodeId:', nodeId);
      instance.state = 'connected';

      // Annoncer présence avec pubkey (retained pour que les pairs voient notre clé)
      client.publish(
        TOPICS.identity(nodeId),
        JSON.stringify({ nodeId, pubkeyHex, online: true, ts: Date.now() }),
        { qos: 1, retain: true }
      );

      // S'abonner aux DMs entrants
      client.subscribe(TOPICS.dm(nodeId), { qos: 1 }, (err) => {
        if (err) console.log('[MQTT] Erreur subscribe DM:', err);
        else console.log('[MQTT] Abonné aux DMs:', TOPICS.dm(nodeId));
      });

      // S'abonner aux messages LoRa entrants
      client.subscribe(TOPICS.loraInbound, { qos: 0 });
    });

    client.on('message', (topic: string, payload: Buffer) => {
      const payloadStr = payload.toString('utf-8');
      console.log('[MQTT] Message reçu topic:', topic, 'len:', payloadStr.length);
      const handlers = instance.handlers.get(topic) ?? [];
      const wildcardHandlers = instance.handlers.get('#') ?? [];
      // Matcher les patterns "prefix/+" (ex: meshcore/identity/+)
      const patternMatches: MessageHandler[] = [];
      instance.patternHandlers.forEach((hs, pattern) => {
        if (topicMatchesPattern(topic, pattern)) {
          patternMatches.push(...hs);
        }
      });
      [...handlers, ...wildcardHandlers, ...patternMatches].forEach(h => {
        try { h(topic, payloadStr); } catch (e) { console.log('[MQTT] Erreur handler:', e); }
      });
    });

    client.on('error', (err) => {
      console.log('[MQTT] Erreur:', err.message);
      instance.state = 'error';
    });

    client.on('reconnect', () => {
      console.log('[MQTT] Reconnexion...');
      instance.state = 'connecting';
    });

    client.on('offline', () => {
      console.log('[MQTT] Hors ligne');
      instance.state = 'disconnected';
    });

    client.on('close', () => {
      console.log('[MQTT] Connexion fermée');
      instance.state = 'disconnected';
    });

  } catch (err) {
    console.log('[MQTT] Erreur création client:', err);
    instance.state = 'error';
  }

  return instance;
}

// Publier un message
export function publishMesh(
  instance: MeshMqttClient,
  topic: string,
  payload: string,
  qos: 0 | 1 = 1,
  retain = false
): void {
  if (!instance.client || instance.state !== 'connected') {
    console.log('[MQTT] Impossible de publier — non connecté, state:', instance.state);
    return;
  }
  instance.client.publish(topic, payload, { qos, retain }, (err) => {
    if (err) console.log('[MQTT] Erreur publish:', err);
  });
}

// S'abonner à un topic avec handler
export function subscribeMesh(
  instance: MeshMqttClient,
  topic: string,
  handler: MessageHandler,
  qos: 0 | 1 = 1
): void {
  if (!instance.handlers.has(topic)) {
    instance.handlers.set(topic, []);
  }
  instance.handlers.get(topic)!.push(handler);

  if (instance.client && instance.state === 'connected') {
    instance.client.subscribe(topic, { qos }, (err) => {
      if (err) console.log('[MQTT] Erreur subscribe:', topic, err);
      else console.log('[MQTT] Abonné:', topic);
    });
  } else {
    // Enregistrer pour subscription à la connexion
    instance.client?.once('connect', () => {
      instance.client?.subscribe(topic, { qos }, (err) => {
        if (err) console.log('[MQTT] Erreur subscribe (reconnect):', topic, err);
      });
    });
  }
}

// Se désabonner d'un topic
export function unsubscribeMesh(instance: MeshMqttClient, topic: string): void {
  instance.handlers.delete(topic);
  instance.client?.unsubscribe(topic);
}

// Déconnecter proprement
export function disconnectMesh(instance: MeshMqttClient): void {
  if (instance.client) {
    // Marquer offline avant de déconnecter
    if (instance.state === 'connected') {
      instance.client.publish(
        TOPICS.identity(instance.nodeId),
        JSON.stringify({ nodeId: instance.nodeId, online: false }),
        { qos: 1, retain: true }
      );
    }
    instance.client.end(false);
    instance.state = 'disconnected';
    console.log('[MQTT] Déconnecté proprement');
  }
}

// Rejoindre un forum (subscribe au channel)
export function joinForumChannel(
  instance: MeshMqttClient,
  channelId: string,
  handler: MessageHandler
): void {
  const topic = TOPICS.forum(channelId);
  subscribeMesh(instance, topic, handler, 1);
  console.log('[MQTT] Rejoint forum:', channelId);
}

// Quitter un forum
export function leaveForumChannel(instance: MeshMqttClient, channelId: string): void {
  unsubscribeMesh(instance, TOPICS.forum(channelId));
}

// Matcher un topic MQTT avec un pattern contenant "+"
// ex: "meshcore/identity/+" matche "meshcore/identity/MESH-A7F2"
export function topicMatchesPattern(topic: string, pattern: string): boolean {
  const topicParts = topic.split('/');
  const patternParts = pattern.split('/');
  if (topicParts.length !== patternParts.length) return false;
  return patternParts.every((p, i) => p === '+' || p === topicParts[i]);
}

// S'abonner à un topic wildcard "+" (un niveau)
export function subscribePattern(
  instance: MeshMqttClient,
  pattern: string,
  handler: MessageHandler,
  qos: 0 | 1 = 0
): void {
  if (!instance.patternHandlers.has(pattern)) {
    instance.patternHandlers.set(pattern, []);
  }
  instance.patternHandlers.get(pattern)!.push(handler);

  if (instance.client && instance.state === 'connected') {
    instance.client.subscribe(pattern, { qos }, (err) => {
      if (err) console.log('[MQTT] Erreur subscribe pattern:', pattern, err);
      else console.log('[MQTT] Abonné pattern:', pattern);
    });
  } else {
    instance.client?.once('connect', () => {
      instance.client?.subscribe(pattern, { qos });
    });
  }
}

// Mettre à jour la présence (identity retained) avec GPS optionnel
export function updatePresence(
  instance: MeshMqttClient,
  nodeId: string,
  pubkeyHex: string,
  lat?: number,
  lng?: number
): void {
  if (!instance.client || instance.state !== 'connected') return;
  const payload: Record<string, unknown> = {
    nodeId,
    pubkeyHex,
    online: true,
    ts: Date.now(),
  };
  if (lat !== undefined && lng !== undefined) {
    payload.lat = lat;
    payload.lng = lng;
  }
  instance.client.publish(
    TOPICS.identity(nodeId),
    JSON.stringify(payload),
    { qos: 1, retain: true }
  );
  console.log('[MQTT] Présence mise à jour avec GPS:', lat, lng);
}

// Fetcher la clé publique d'un pair (via topic identity retained)
export function fetchPeerPubkey(
  instance: MeshMqttClient,
  peerNodeId: string,
  callback: (pubkeyHex: string | null) => void,
  timeoutMs = 5000
): void {
  const topic = TOPICS.identity(peerNodeId);
  let resolved = false;

  const handler: MessageHandler = (_t, payload) => {
    if (resolved) return;
    resolved = true;
    try {
      const data = JSON.parse(payload) as { pubkeyHex?: string };
      callback(data.pubkeyHex ?? null);
    } catch {
      callback(null);
    }
    unsubscribeMesh(instance, topic);
  };

  subscribeMesh(instance, topic, handler, 0);

  // Timeout si le pair n'est pas en ligne
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      console.log('[MQTT] Timeout pubkey pour:', peerNodeId);
      callback(null);
      unsubscribeMesh(instance, topic);
    }
  }, timeoutMs);
}
