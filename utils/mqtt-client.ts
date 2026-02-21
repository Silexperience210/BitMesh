// Vrai client MQTT WebSocket pour messagerie P2P MeshCore
import mqtt, { MqttClient as MqttJsClient, IClientOptions } from 'mqtt';
import { publishWithRetry as publishWithRetryUtil } from './mqtt';

export { publishWithRetryUtil as publishWithRetry };

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type MessageHandler = (topic: string, payload: string) => void;

const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

// ✅ BROKERS ALTERNATIFS (WebSocket ports)
export const BROKER_OPTIONS = [
  { name: 'EMQX Public', url: 'wss://broker.emqx.io:8084/mqtt', description: 'Broker public rapide' },
  { name: 'HiveMQ Public', url: 'wss://broker.hivemq.com:8884/mqtt', description: 'Alternative fiable' },
  { name: 'Mosquitto Test', url: 'wss://test.mosquitto.org:8081/mqtt', description: 'Broker de test Eclipse' },
];

// Topics MeshCore
export const TOPICS = {
  identity: (nodeId: string) => `meshcore/identity/${nodeId}`,
  dm: (nodeId: string) => `meshcore/dm/${nodeId}`,
  forum: (channelId: string) => `meshcore/forum/${channelId}`,
  route: (nodeId: string) => `meshcore/route/${nodeId}`,
  loraInbound: 'meshcore/lora/inbound',
  loraOutbound: 'meshcore/lora/outbound',
  gatewayAnnounce: 'meshcore/gateway/announce',
  forumsAnnounce: 'meshcore/forums/announce', // ✅ NOUVEAU : Découverte de forums (wildcard sub)
  forumAnnounce: (channelName: string) => `meshcore/forums/announce/${channelName}`, // Retained par forum
} as const;

export interface MeshMqttClient {
  client: MqttJsClient | null;
  state: MqttConnectionState;
  nodeId: string;
  handlers: Map<string, MessageHandler[]>;
  // Handlers pour patterns MQTT à un niveau (ex: "meshcore/identity/+")
  patternHandlers: Map<string, MessageHandler[]>;
  // FIX BUG 2: handler d'annonces forum caché pour éviter accumulation sur reconnexion
  forumAnnouncementHandler?: MessageHandler;
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
    // FIX #2: clientId stable (sans timestamp) + clean:false pour récupérer
    // les messages QoS 1 manqués pendant une déconnexion
    clientId: `meshcore-${nodeId}`,
    keepalive: 60,
    clean: false,
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
      // FIX #5: Envoyer les messages en attente dès la (re)connexion
      setTimeout(() => flushMqttQueue(instance), 500);

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

// FIX #5: Queue offline — messages en attente si MQTT déconnecté
export interface QueuedMessage { topic: string; payload: string; qos: 0 | 1; retain: boolean; }
const MQTT_QUEUE_MAX = 50;
const mqttOfflineQueues = new Map<string, QueuedMessage[]>();

export function flushMqttQueue(instance: MeshMqttClient): void {
  const queue = mqttOfflineQueues.get(instance.nodeId) ?? [];
  if (queue.length === 0) return;
  console.log(`[MQTT] Flush queue offline: ${queue.length} messages`);
  const toSend = [...queue];
  mqttOfflineQueues.set(instance.nodeId, []);
  for (const msg of toSend) {
    instance.client?.publish(msg.topic, msg.payload, { qos: msg.qos, retain: msg.retain });
  }
}

// Publier un message (avec queue offline si déconnecté)
export function publishMesh(
  instance: MeshMqttClient,
  topic: string,
  payload: string,
  qos: 0 | 1 = 1,
  retain = false
): void {
  if (!instance.client || instance.state !== 'connected') {
    // FIX #5: Mettre en queue si QoS 1 (messages importants seulement)
    if (qos === 1) {
      const queue = mqttOfflineQueues.get(instance.nodeId) ?? [];
      if (queue.length < MQTT_QUEUE_MAX) {
        queue.push({ topic, payload, qos, retain });
        mqttOfflineQueues.set(instance.nodeId, queue);
        console.log(`[MQTT] Message mis en queue offline (${queue.length}/${MQTT_QUEUE_MAX}):`, topic);
      } else {
        console.log('[MQTT] Queue offline pleine — message ignoré:', topic);
      }
    } else {
      console.log('[MQTT] Impossible de publier QoS 0 — non connecté, state:', instance.state);
    }
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
  // FIX: Éviter les handlers dupliqués (important lors de la reconnexion)
  const existing = instance.handlers.get(topic)!;
  if (existing.includes(handler)) return;
  existing.push(handler);

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
  // FIX: Éviter les handlers dupliqués (reconnexion)
  const existing = instance.patternHandlers.get(pattern)!;
  if (existing.includes(handler)) {
    // Handler déjà enregistré, juste re-subscribe au broker si connecté
    if (instance.client && instance.state === 'connected') {
      instance.client.subscribe(pattern, { qos });
    }
    return;
  }
  existing.push(handler);

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

// ✅ NOUVEAU : Interface pour annonce de forum
export interface ForumAnnouncement {
  channelName: string;
  description: string;
  creatorNodeId: string;
  creatorPubkey: string;
  ts: number;
  isPublic: boolean;
}

// ✅ NOUVEAU : Annoncer un forum public
export function announceForumChannel(
  instance: MeshMqttClient,
  channelName: string,
  description: string,
  creatorPubkey: string,
  isPublic: boolean = true
): void {
  if (!instance.client || instance.state !== 'connected') {
    console.log('[MQTT] Impossible d\'annoncer le forum — non connecté');
    return;
  }

  const announcement: ForumAnnouncement = {
    channelName,
    description,
    creatorNodeId: instance.nodeId,
    creatorPubkey,
    ts: Date.now(),
    isPublic,
  };

  // ✅ FIX : Topic par forum + retain:true + qos:1 pour que les nouveaux clients
  // reçoivent l'annonce même s'ils se connectent APRÈS la création du forum.
  const topic = TOPICS.forumAnnounce(channelName);
  instance.client.publish(
    topic,
    JSON.stringify(announcement),
    { qos: 1, retain: true },
    (err) => {
      if (err) {
        console.log('[MQTT] Erreur annonce forum:', err);
      } else {
        console.log('[MQTT] Forum annoncé (retained):', channelName);
      }
    }
  );
}

// ✅ NOUVEAU : S'abonner aux annonces de forums
export function subscribeForumAnnouncements(
  instance: MeshMqttClient,
  handler: (announcement: ForumAnnouncement) => void
): void {
  // FIX BUG 2: créer le wrappedHandler une seule fois et le cacher dans l'instance
  // → subscribePattern déduplique par référence, donc toujours la même référence = pas d'accumulation
  if (!instance.forumAnnouncementHandler) {
    instance.forumAnnouncementHandler = (_topic, payload) => {
      try {
        // Ignorer les messages vides (suppression retained)
        if (!payload || payload.trim() === '') return;
        const announcement = JSON.parse(payload) as ForumAnnouncement;
        // Ignorer nos propres annonces (nos forums sont déjà dans conversations)
        if (announcement.creatorNodeId !== instance.nodeId) {
          handler(announcement);
        }
      } catch (err) {
        console.log('[MQTT] Erreur parse annonce forum:', err);
      }
    };
  }

  // Wildcard "+" pour recevoir TOUS les forums retained sur leurs topics individuels
  const wildcardTopic = `${TOPICS.forumsAnnounce}/+`;
  subscribePattern(instance, wildcardTopic, instance.forumAnnouncementHandler, 1);
  console.log('[MQTT] Abonné aux annonces de forums (wildcard):', wildcardTopic);
}

// ✅ NOUVEAU : Se désabonner des annonces de forums
export function unsubscribeForumAnnouncements(instance: MeshMqttClient): void {
  const wildcardTopic = `${TOPICS.forumsAnnounce}/+`;
  // FIX BUG 3: supprimer de patternHandlers (pas handlers) car ajouté via subscribePattern
  instance.patternHandlers.delete(wildcardTopic);
  instance.client?.unsubscribe(wildcardTopic);
  instance.forumAnnouncementHandler = undefined;
  console.log('[MQTT] Désabonné des annonces de forums');
}
