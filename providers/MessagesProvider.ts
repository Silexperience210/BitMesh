// Provider principal pour la messagerie MeshCore P2P chiffrée
import { useState, useEffect, useCallback, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import {
  type MeshMqttClient,
  createMeshMqttClient,
  publishMesh,
  subscribeMesh,
  disconnectMesh,
  joinForumChannel,
  leaveForumChannel,
  fetchPeerPubkey,
  TOPICS,
} from '@/utils/mqtt-client';
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
  const mqttRef = useRef<MeshMqttClient | null>(null);
  const joinedForums = useRef<Set<string>>(new Set());

  // Dériver l'identité dès que le wallet est disponible
  useEffect(() => {
    if (mnemonic && !identity) {
      try {
        const id = deriveMeshIdentity(mnemonic);
        setIdentity(id);
        console.log('[Messages] Identité dérivée:', id.nodeId);
      } catch (err) {
        console.log('[Messages] Erreur dérivation identité:', err);
      }
    }
  }, [mnemonic, identity]);

  // Charger les conversations depuis AsyncStorage
  useEffect(() => {
    listConversations().then(convs => {
      setConversations(convs);
    });
  }, []);

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
      const msg: StoredMessage = {
        id: wire.id,
        conversationId: convId,
        from: wire.from,
        fromPubkey: wire.fromPubkey,
        text: plaintext,
        type: wire.type,
        timestamp: wire.ts,
        isMine,
        status: 'delivered',
      };

      saveMessage(msg);
      if (!isMine) {
        updateConversationLastMessage(convId, plaintext.slice(0, 50), wire.ts, true);
      }

      setMessagesByConv(prev => ({
        ...prev,
        [convId]: [...(prev[convId] ?? []), msg],
      }));

      if (!isMine) {
        setConversations(prev =>
          prev.map(c => c.id === convId
            ? { ...c, lastMessage: `${wire.from}: ${plaintext.slice(0, 40)}`, lastMessageTime: wire.ts, unreadCount: c.unreadCount + 1 }
            : c
          )
        );
      }
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
          // Rejoindre les forums déjà enregistrés
          joinedForums.current.forEach(ch => {
            joinForumChannel(client, ch, handleIncomingForum(ch));
          });
          clearInterval(statePoller);
        }
      }
    }, 500);
  }, [identity, handleIncomingDM, handleIncomingForum]);

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
