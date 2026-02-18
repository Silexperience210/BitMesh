// Provider principal pour la messagerie MeshCore P2P chiffrée
import { useState, useEffect, useCallback, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import {
  type MeshMqttClient,
  createMeshMqttClient,
  publishMesh,
  subscribeMesh,
  subscribePattern,
  updatePresence,
  disconnectMesh,
  joinForumChannel,
  leaveForumChannel,
  fetchPeerPubkey,
  TOPICS,
} from '@/utils/mqtt-client';
import * as Location from 'expo-location';
import { type RadarPeer, haversineDistance, gpsBearing, distanceToSignal } from '@/utils/radar';
import {
  encryptDM,
  decryptDM,
  encryptForum,
  decryptForum,
  type EncryptedPayload,
} from '@/utils/encryption';
import {
  type StoredMessage,
  type StoredConversation,
  type MessageType,
  listConversations,
  saveConversation,
  loadMessages,
  saveMessage,
  updateConversationLastMessage,
  markConversationRead,
  generateMsgId,
} from '@/utils/messages-store';
import { deriveMeshIdentity, type MeshIdentity } from '@/utils/identity';
import { MeshRouter, type MeshMessage, isValidMeshMessage } from '@/utils/mesh-routing';
// MeshIdentity utilisé comme type de paramètre pour publishAndStore
import { useWalletSeed } from '@/providers/WalletSeedProvider';

// Format du message sur le réseau MQTT
interface WireMessage {
  v: number;
  id: string;
  from: string;
  fromPubkey: string;
  to: string;          // nodeId destinataire ou "forum:channelName"
  enc: EncryptedPayload;
  ts: number;
  type: MessageType;
}

export interface MessagesState {
  identity: MeshIdentity | null;
  mqttState: 'disconnected' | 'connecting' | 'connected' | 'error';
  conversations: StoredConversation[];
  // Messages par convId
  messagesByConv: Record<string, StoredMessage[]>;
  // Pairs visibles sur le radar (via MQTT identity)
  radarPeers: RadarPeer[];
  // Notre position GPS
  myLocation: { lat: number; lng: number } | null;
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (convId: string, text: string, type?: MessageType) => Promise<void>;
  sendCashu: (convId: string, token: string, amountSats: number) => Promise<void>;
  loadConversationMessages: (convId: string) => Promise<void>;
  startConversation: (peerNodeId: string, peerName?: string) => Promise<void>;
  joinForum: (channelName: string) => Promise<void>;
  leaveForum: (channelName: string) => void;
  markRead: (convId: string) => Promise<void>;
}

export const [MessagesContext, useMessages] = createContextHook((): MessagesState => {
  const { mnemonic } = useWalletSeed();
  const [identity, setIdentity] = useState<MeshIdentity | null>(null);
  const [mqttState, setMqttState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, StoredMessage[]>>({});
  const [radarPeers, setRadarPeers] = useState<RadarPeer[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const myLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const mqttRef = useRef<MeshMqttClient | null>(null);
  const meshRouterRef = useRef<MeshRouter | null>(null);
  const joinedForums = useRef<Set<string>>(new Set());

  // Dériver l'identité dès que le wallet est disponible
  useEffect(() => {
    if (mnemonic && !identity) {
      try {
        const id = deriveMeshIdentity(mnemonic);
        setIdentity(id);
        console.log('[Messages] Identité dérivée:', id.nodeId);

        // Initialiser le MeshRouter
        meshRouterRef.current = new MeshRouter(id.nodeId);
        console.log('[MeshRouter] Initialisé pour:', id.nodeId);
      } catch (err) {
        console.log('[Messages] Erreur dérivation identité:', err);
      }
    }

    // Cleanup du router au démontage
    return () => {
      if (meshRouterRef.current) {
        meshRouterRef.current.destroy();
      }
    };
  }, [mnemonic, identity]);

  // Charger les conversations depuis AsyncStorage
  useEffect(() => {
    listConversations().then(convs => {
      setConversations(convs);
    });
  }, []);

  // Demander la permission GPS et tracker notre position
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Radar] Permission GPS refusée');
        return;
      }
      // Position initiale
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setMyLocation(pos);
      myLocationRef.current = pos;
      console.log('[Radar] Position initiale:', pos.lat.toFixed(4), pos.lng.toFixed(4));

      // Mise à jour continue (~5 secondes)
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (location) => {
          const p = { lat: location.coords.latitude, lng: location.coords.longitude };
          setMyLocation(p);
          myLocationRef.current = p;
          // Mettre à jour la présence MQTT avec le nouveau GPS
          if (mqttRef.current && identity) {
            updatePresence(mqttRef.current, identity.nodeId, identity.pubkeyHex, p.lat, p.lng);
          }
        }
      );
    })();
    return () => { subscription?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  // Handler de présence d'un pair distant (topic: meshcore/identity/{nodeId})
  const handlePeerPresence = useCallback((topic: string, payloadStr: string) => {
    if (!identity) return;
    try {
      const data = JSON.parse(payloadStr) as {
        nodeId?: string;
        pubkeyHex?: string;
        online?: boolean;
        ts?: number;
        lat?: number;
        lng?: number;
      };
      if (!data.nodeId || data.nodeId === identity.nodeId) return;

      const myPos = myLocationRef.current;
      let distanceMeters = 0;
      let bearingRad = 0;

      if (myPos && data.lat !== undefined && data.lng !== undefined) {
        distanceMeters = haversineDistance(myPos.lat, myPos.lng, data.lat, data.lng);
        bearingRad = gpsBearing(myPos.lat, myPos.lng, data.lat, data.lng);
      } else {
        // Pas de GPS: distance inconnue, angle aléatoire stable basé sur nodeId hash
        const hash = data.nodeId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        distanceMeters = 500 + (hash % 4000);
        bearingRad = (hash % 628) / 100; // 0..2π
      }

      const peer: RadarPeer = {
        nodeId: data.nodeId,
        name: data.nodeId,
        distanceMeters,
        bearingRad,
        online: data.online !== false,
        pubkeyHex: data.pubkeyHex,
        lat: data.lat,
        lng: data.lng,
        lastSeen: data.ts ?? Date.now(),
        signalStrength: distanceToSignal(distanceMeters),
      };

      setRadarPeers(prev => {
        const filtered = prev.filter(p => p.nodeId !== data.nodeId);
        if (!peer.online && filtered.length === prev.length) return prev; // pair déjà absent
        return peer.online ? [peer, ...filtered] : filtered;
      });
    } catch (err) {
      console.log('[Radar] Erreur parse présence:', err);
    }
  }, [identity]);

  // Handler pour un message DM entrant
  const handleIncomingDM = useCallback((topic: string, payloadStr: string) => {
    if (!identity) return;
    try {
      const wire = JSON.parse(payloadStr) as WireMessage;
      if (wire.from === identity.nodeId) return; // ignorer nos propres messages

      const plaintext = decryptDM(wire.enc, identity.privkeyBytes, wire.fromPubkey);

      const msg: StoredMessage = {
        id: wire.id,
        conversationId: wire.from,
        from: wire.from,
        fromPubkey: wire.fromPubkey,
        text: plaintext,
        type: wire.type,
        timestamp: wire.ts,
        isMine: false,
        status: 'delivered',
        cashuAmount: wire.type === 'cashu' ? parseCashuAmount(plaintext) : undefined,
        cashuToken: wire.type === 'cashu' ? plaintext : undefined,
      };

      saveMessage(msg);
      updateConversationLastMessage(wire.from, plaintext.slice(0, 50), wire.ts, true);

      setMessagesByConv(prev => ({
        ...prev,
        [wire.from]: [...(prev[wire.from] ?? []), msg],
      }));

      // Créer la conversation si elle n'existe pas encore
      setConversations(prev => {
        const exists = prev.find(c => c.id === wire.from);
        if (!exists) {
          const newConv: StoredConversation = {
            id: wire.from,
            name: wire.from,
            isForum: false,
            peerPubkey: wire.fromPubkey,
            lastMessage: plaintext.slice(0, 50),
            lastMessageTime: wire.ts,
            unreadCount: 1,
            online: true,
          };
          saveConversation(newConv);
          return [newConv, ...prev];
        }
        return prev.map(c => {
          if (c.id !== wire.from) return c;
          const updated = { ...c, lastMessage: plaintext.slice(0, 50), lastMessageTime: wire.ts, unreadCount: c.unreadCount + 1, peerPubkey: wire.fromPubkey, online: true };
          // Persister la pubkey du pair pour les envois futurs
          if (!c.peerPubkey) saveConversation(updated);
          return updated;
        });
      });
    } catch (err) {
      console.log('[Messages] Erreur déchiffrement DM:', err);
    }
  }, [identity]);

  // Handler pour les messages multi-hop routés (meshcore/route/{nodeId})
  const handleIncomingRouteMessage = useCallback((topic: string, payloadStr: string) => {
    if (!identity || !meshRouterRef.current) return;

    try {
      const meshMsg = JSON.parse(payloadStr) as MeshMessage;

      // Valider le format du message
      if (!isValidMeshMessage(meshMsg)) {
        console.log('[MeshRouter] Message invalide ignoré');
        return;
      }

      // Traiter via MeshRouter (deliver/relay/drop)
      const action = meshRouterRef.current.processIncomingMessage(meshMsg);

      if (action === 'drop') {
        // Message dupliqué ou TTL expiré → ignorer
        return;
      }

      if (action === 'deliver') {
        // Message pour nous → déchiffrer et afficher
        const plaintext = decryptDM(meshMsg.enc, identity.privkeyBytes, meshMsg.fromPubkey || '');

        const msg: StoredMessage = {
          id: meshMsg.msgId,
          conversationId: meshMsg.from,
          from: meshMsg.from,
          fromPubkey: meshMsg.fromPubkey,
          text: plaintext,
          type: meshMsg.type,
          timestamp: meshMsg.ts,
          isMine: false,
          status: 'delivered',
          cashuAmount: meshMsg.type === 'cashu' ? parseCashuAmount(plaintext) : undefined,
          cashuToken: meshMsg.type === 'cashu' ? plaintext : undefined,
        };

        saveMessage(msg);
        updateConversationLastMessage(meshMsg.from, plaintext.slice(0, 50), meshMsg.ts, true);

        setMessagesByConv(prev => ({
          ...prev,
          [meshMsg.from]: [...(prev[meshMsg.from] ?? []), msg],
        }));

        // Créer conversation si nécessaire
        setConversations(prev => {
          const exists = prev.find(c => c.id === meshMsg.from);
          if (!exists) {
            const newConv: StoredConversation = {
              id: meshMsg.from,
              name: meshMsg.from,
              isForum: false,
              peerPubkey: meshMsg.fromPubkey,
              lastMessage: plaintext.slice(0, 50),
              lastMessageTime: meshMsg.ts,
              unreadCount: 1,
              online: true,
            };
            saveConversation(newConv);
            return [newConv, ...prev];
          }
          return prev.map(c => {
            if (c.id !== meshMsg.from) return c;
            return {
              ...c,
              lastMessage: plaintext.slice(0, 50),
              lastMessageTime: meshMsg.ts,
              unreadCount: c.unreadCount + 1,
              peerPubkey: meshMsg.fromPubkey,
              online: true,
            };
          });
        });

        console.log(`[MeshRouter] Message livré (${meshMsg.hopCount} hops)`);
      }

      if (action === 'relay') {
        // Message pour quelqu'un d'autre → relay
        if (!mqttRef.current?.client) return;

        const relayMsg = meshRouterRef.current.prepareRelay(meshMsg);
        const relayTopic = TOPICS.route(meshMsg.to);

        mqttRef.current.client.publish(
          relayTopic,
          JSON.stringify(relayMsg),
          { qos: 0 },
          (err) => {
            if (err) {
              console.log('[MeshRouter] Erreur relay:', err);
            } else {
              console.log(`[MeshRouter] Message relayé → ${meshMsg.to} (TTL=${relayMsg.ttl}, hops=${relayMsg.hopCount})`);
            }
          }
        );
      }
    } catch (err) {
      console.log('[MeshRouter] Erreur traitement message:', err);
    }
  }, [identity]);

  // Handler pour un message forum entrant
  const handleIncomingForum = useCallback((channelName: string) => (topic: string, payloadStr: string) => {
    if (!identity) return;
    try {
      const wire = JSON.parse(payloadStr) as WireMessage;
      const convId = `forum:${channelName}`;

      let plaintext: string;
      try {
        plaintext = decryptForum(wire.enc, channelName);
      } catch {
        // Forum public sans chiffrement (rétrocompat)
        plaintext = wire.enc as unknown as string;
      }

      const isMine = wire.from === identity.nodeId;
      // Si le message vient de nous-mêmes, publishAndStore l'a déjà sauvegardé → ignorer l'écho
      if (isMine) return;

      const msg: StoredMessage = {
        id: wire.id,
        conversationId: convId,
        from: wire.from,
        fromPubkey: wire.fromPubkey,
        text: plaintext,
        type: wire.type,
        timestamp: wire.ts,
        isMine: false,
        status: 'delivered',
      };

      saveMessage(msg);
      updateConversationLastMessage(convId, plaintext.slice(0, 50), wire.ts, true);

      setMessagesByConv(prev => ({
        ...prev,
        [convId]: [...(prev[convId] ?? []), msg],
      }));

      setConversations(prev =>
        prev.map(c => c.id === convId
          ? { ...c, lastMessage: `${wire.from}: ${plaintext.slice(0, 40)}`, lastMessageTime: wire.ts, unreadCount: c.unreadCount + 1 }
          : c
        )
      );
    } catch (err) {
      console.log('[Messages] Erreur message forum:', channelName, err);
    }
  }, [identity]);

  // Connecter au broker MQTT
  const connect = useCallback(() => {
    if (!identity) {
      console.log('[Messages] Identité non disponible, connexion impossible');
      return;
    }
    if (mqttRef.current?.state === 'connected' || mqttRef.current?.state === 'connecting') {
      return;
    }

    console.log('[Messages] Connexion MQTT nodeId:', identity.nodeId);
    setMqttState('connecting');

    const client = createMeshMqttClient(identity.nodeId, identity.pubkeyHex);
    mqttRef.current = client;

    // Mettre à jour le state de connexion via polling léger
    const statePoller = setInterval(() => {
      if (mqttRef.current) {
        const s = mqttRef.current.state;
        setMqttState(s);
        if (s === 'connected') {
          // S'abonner aux DMs une fois connecté
          subscribeMesh(client, TOPICS.dm(identity.nodeId), handleIncomingDM, 1);
          // S'abonner aux messages routés multi-hop
          subscribeMesh(client, TOPICS.route(identity.nodeId), handleIncomingRouteMessage, 0);
          // S'abonner aux présences de tous les pairs (wildcard)
          subscribePattern(client, 'meshcore/identity/+', handlePeerPresence, 0);
          // Publier notre présence avec GPS si disponible
          const pos = myLocationRef.current;
          updatePresence(client, identity.nodeId, identity.pubkeyHex, pos?.lat, pos?.lng);
          // Rejoindre les forums déjà enregistrés
          joinedForums.current.forEach(ch => {
            joinForumChannel(client, ch, handleIncomingForum(ch));
          });
          clearInterval(statePoller);
        }
      }
    }, 500);
  }, [identity, handleIncomingDM, handleIncomingForum, handleIncomingRouteMessage, handlePeerPresence]);

  // Auto-connexion dès que l'identité est disponible
  useEffect(() => {
    if (identity && mqttRef.current === null) {
      connect();
    }
    return () => {
      if (mqttRef.current) {
        disconnectMesh(mqttRef.current);
        mqttRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]); // connect dépend de identity — on ne se reconnecte qu'une fois par identité

  const disconnect = useCallback(() => {
    if (mqttRef.current) {
      disconnectMesh(mqttRef.current);
      mqttRef.current = null;
      setMqttState('disconnected');
    }
  }, []);

  // Publier un message sur le réseau + le sauvegarder localement (déclaré avant sendMessage)
  const publishAndStore = useCallback((
    msgId: string,
    convId: string,
    text: string,
    enc: EncryptedPayload,
    topic: string,
    ts: number,
    type: MessageType,
    id: MeshIdentity
  ) => {
    if (!mqttRef.current) return;

    // Si c'est un DM (et non un forum), utiliser multi-hop routing
    const isDM = topic.startsWith('meshcore/dm/');

    if (isDM && meshRouterRef.current) {
      // Créer un MeshMessage avec MeshRouter
      const meshMsg = meshRouterRef.current.createMessage(
        convId, // to
        enc,
        id.pubkeyHex,
        type
      );

      // Publier sur meshcore/route/{to} pour multi-hop
      const routeTopic = TOPICS.route(convId);
      publishMesh(mqttRef.current, routeTopic, JSON.stringify(meshMsg), 0);

      console.log(`[MeshRouter] Message envoyé → ${convId} (TTL=${meshMsg.ttl})`);
    } else {
      // Forum ou fallback : utiliser l'ancien format WireMessage
      const wire: WireMessage = {
        v: 1,
        id: msgId,
        from: id.nodeId,
        fromPubkey: id.pubkeyHex,
        to: convId,
        enc,
        ts,
        type,
      };

      publishMesh(mqttRef.current, topic, JSON.stringify(wire), 1);
    }

    // Sauvegarder localement
    const msg: StoredMessage = {
      id: msgId,
      conversationId: convId,
      from: id.nodeId,
      fromPubkey: id.pubkeyHex,
      text,
      type,
      timestamp: ts,
      isMine: true,
      status: 'sent',
      cashuAmount: type === 'cashu' ? parseCashuAmount(text) : undefined,
      cashuToken: type === 'cashu' ? text : undefined,
    };

    saveMessage(msg);
    updateConversationLastMessage(convId, text.slice(0, 50), ts, false);

    setMessagesByConv(prev => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), msg],
    }));

    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, lastMessage: text.slice(0, 50), lastMessageTime: ts }
        : c
    ));
  }, []);

  // Envoyer un message (DM ou forum)
  const sendMessage = useCallback(async (
    convId: string,
    text: string,
    type: MessageType = 'text'
  ): Promise<void> => {
    if (!identity || !mqttRef.current) {
      throw new Error('Non connecté');
    }

    const id = identity; // capture stable
    const isForum = convId.startsWith('forum:');
    const msgId = generateMsgId();
    const ts = Date.now();

    if (isForum) {
      const channelName = convId.slice(6); // enlever "forum:"
      const enc = encryptForum(text, channelName);
      const topic = TOPICS.forum(channelName);
      publishAndStore(msgId, convId, text, enc, topic, ts, type, id);
      return;
    }

    // DM: récupérer pubkey du pair depuis nos conversations
    const conv = conversations.find(c => c.id === convId);
    if (!conv?.peerPubkey) {
      // Tenter de récupérer la pubkey du pair via MQTT (retained message)
      return new Promise((resolve, reject) => {
        fetchPeerPubkey(mqttRef.current!, convId, (pubkeyHex) => {
          if (!pubkeyHex) {
            reject(new Error('Pair hors ligne — clé publique introuvable'));
            return;
          }
          // Persister la pubkey dans AsyncStorage pour les envois futurs hors ligne
          setConversations(prev => {
            const updated = prev.map(c =>
              c.id === convId ? { ...c, peerPubkey: pubkeyHex } : c
            );
            const updatedConv = updated.find(c => c.id === convId);
            if (updatedConv) saveConversation(updatedConv);
            return updated;
          });
          const enc = encryptDM(text, id.privkeyBytes, pubkeyHex);
          publishAndStore(msgId, convId, text, enc, TOPICS.dm(convId), ts, type, id);
          resolve();
        });
      });
    }

    const enc = encryptDM(text, id.privkeyBytes, conv.peerPubkey);
    publishAndStore(msgId, convId, text, enc, TOPICS.dm(convId), ts, type, id);
  }, [identity, conversations, publishAndStore]);

  // Envoyer un Cashu token
  const sendCashu = useCallback(async (
    convId: string,
    token: string,
    amountSats: number
  ): Promise<void> => {
    await sendMessage(convId, token, 'cashu');
  }, [sendMessage]);

  // Charger les messages d'une conversation depuis AsyncStorage
  const loadConversationMessages = useCallback(async (convId: string): Promise<void> => {
    const msgs = await loadMessages(convId);
    setMessagesByConv(prev => ({ ...prev, [convId]: msgs }));
  }, []);

  // Démarrer une nouvelle conversation DM
  const startConversation = useCallback(async (
    peerNodeId: string,
    peerName?: string
  ): Promise<void> => {
    const existing = conversations.find(c => c.id === peerNodeId);
    if (existing) return;

    const conv: StoredConversation = {
      id: peerNodeId,
      name: peerName ?? peerNodeId,
      isForum: false,
      lastMessage: '',
      lastMessageTime: Date.now(),
      unreadCount: 0,
      online: false,
    };
    await saveConversation(conv);
    setConversations(prev => [conv, ...prev]);
  }, [conversations]);

  // Rejoindre un forum
  const joinForum = useCallback(async (channelName: string): Promise<void> => {
    const convId = `forum:${channelName}`;
    joinedForums.current.add(channelName);

    if (mqttRef.current?.state === 'connected') {
      joinForumChannel(mqttRef.current, channelName, handleIncomingForum(channelName));
    }

    const existing = conversations.find(c => c.id === convId);
    if (!existing) {
      const conv: StoredConversation = {
        id: convId,
        name: `#${channelName}`,
        isForum: true,
        lastMessage: '',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        online: true,
      };
      await saveConversation(conv);
      setConversations(prev => [conv, ...prev]);
    }
    console.log('[Messages] Forum rejoint:', channelName);
  }, [conversations, handleIncomingForum]);

  // Quitter un forum
  const leaveForum = useCallback((channelName: string): void => {
    joinedForums.current.delete(channelName);
    if (mqttRef.current) {
      leaveForumChannel(mqttRef.current, channelName);
    }
    console.log('[Messages] Forum quitté:', channelName);
  }, []);

  // Marquer une conversation comme lue
  const markRead = useCallback(async (convId: string): Promise<void> => {
    await markConversationRead(convId);
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, unreadCount: 0 } : c
    ));
  }, []);

  return {
    identity,
    mqttState,
    conversations,
    messagesByConv,
    radarPeers,
    myLocation,
    connect,
    disconnect,
    sendMessage,
    sendCashu,
    loadConversationMessages,
    startConversation,
    joinForum,
    leaveForum,
    markRead,
  };
});

// Extraire le montant d'un Cashu token (approximatif depuis le texte)
function parseCashuAmount(text: string): number | undefined {
  try {
    if (!text.startsWith('cashuA')) return undefined;
    const base64 = text.slice(6);
    const json = JSON.parse(atob(base64));
    let total = 0;
    for (const entry of json.token ?? []) {
      for (const proof of entry.proofs ?? []) {
        total += proof.amount ?? 0;
      }
    }
    return total || undefined;
  } catch {
    return undefined;
  }
}
