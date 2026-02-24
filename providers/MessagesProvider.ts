// Provider principal pour la messagerie MeshCore P2P chiffrée
import { useState, useEffect, useCallback, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import * as Notifications from 'expo-notifications'; // ✅ NOUVEAU
import {
  type MeshMqttClient,
  type MessageHandler,
  createMeshMqttClient,
  publishMesh,
  subscribeMesh,
  subscribePattern,
  updatePresence,
  disconnectMesh,
  joinForumChannel,
  leaveForumChannel,
  fetchPeerPubkey,
  announceForumChannel,
  subscribeForumAnnouncements,
  type ForumAnnouncement,
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
import { isChunkPacket } from '@/utils/meshcore-protocol';
import {
  type StoredMessage,
  type StoredConversation,
  type MessageType,
  listConversations,
  saveConversation,
  loadMessages,
  saveMessage,
  updateConversationLastMessage,
  updateConversationPubkey,
  markConversationRead,
  generateMsgId,
} from '@/utils/messages-store';
import { cleanupOldMessages, getUserProfile, setUserProfile, saveCashuToken, getUnverifiedCashuTokens, markCashuTokenVerified, incrementRetryCount, deleteMessageDB, deleteConversationDB, saveContact, getContacts, deleteContact, isContact, toggleContactFavorite, type DBContact } from '@/utils/database';
import { deriveMeshIdentity, type MeshIdentity, verifyNodeId } from '@/utils/identity';
import { MeshRouter, type MeshMessage, isValidMeshMessage } from '@/utils/mesh-routing';
// MeshIdentity utilisé comme type de paramètre pour publishAndStore
import { useWalletSeed } from '@/providers/WalletSeedProvider';
// Import BLE provider pour communication LoRa via gateway ESP32
import { useBle } from '@/providers/BleProvider';
// Import Gateway provider pour tracking peers, relay LoRa et Cashu
import { useGateway } from '@/providers/GatewayProvider';
import { type GatewayPeer } from '@/utils/gateway';
// Import protocole MeshCore binaire
import {
  type MeshCorePacket,
  MeshCoreMessageType,
  MeshCoreFlags,
  extractTextFromPacket,
  uint64ToNodeId,
  nodeIdToUint64,
  decodeEncryptedPayload,
  createKeyAnnouncePacket,
  extractPubkeyFromAnnounce,
  extractPosition,
} from '@/utils/meshcore-protocol';
// Import Cashu validation
import { verifyCashuToken, generateTokenId } from '@/utils/cashu';
import { getChunkManager, validateMessageSize } from '@/services/ChunkManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JOINED_FORUMS_KEY = 'bitmesh:joined_forums_v1';

// Format du message sur le réseau MQTT
interface WireMessage {
  v: number;
  id: string;
  from?: string;
  fromNodeId: string;
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
  // ✅ NOUVEAU : Forums découverts via MQTT
  discoveredForums: ForumAnnouncement[];
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (convId: string, text: string, type?: MessageType) => Promise<void>;
  sendAudio: (convId: string, base64: string, durationMs: number) => Promise<void>;
  sendImage: (convId: string, base64: string, mimeType: string) => Promise<void>;
  sendCashu: (convId: string, token: string, amountSats: number) => Promise<void>;
  loadConversationMessages: (convId: string) => Promise<void>;
  startConversation: (peerNodeId: string, peerName?: string) => Promise<void>;
  joinForum: (channelName: string, description?: string) => Promise<void>;
  leaveForum: (channelName: string) => void;
  markRead: (convId: string) => Promise<void>;
  announceForumPublic: (channelName: string, description: string) => boolean;
  setDisplayName: (name: string) => Promise<void>;
  deleteMessage: (msgId: string, convId: string) => Promise<void>;
  deleteConversation: (convId: string) => Promise<void>;
  // Contacts
  contacts: DBContact[];
  addContact: (nodeId: string, displayName: string, pubkeyHex?: string) => Promise<void>;
  removeContact: (nodeId: string) => Promise<void>;
  isContact: (nodeId: string) => Promise<boolean>;
  toggleFavorite: (nodeId: string) => Promise<void>;
  refreshContacts: () => Promise<void>;
}

export const [MessagesContext, useMessages] = createContextHook((): MessagesState => {
  const { mnemonic } = useWalletSeed();
  const ble = useBle(); // Accès au BLE gateway pour LoRa
  const { gatewayState, registerPeer, handleLoRaMessage: handleLoRaMsg, relayCashu } = useGateway();
  const [identity, setIdentity] = useState<MeshIdentity | null>(null);
  const [mqttState, setMqttState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, StoredMessage[]>>({});
  const [radarPeers, setRadarPeers] = useState<RadarPeer[]>([]);
  const [contacts, setContacts] = useState<DBContact[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const myLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const mqttRef = useRef<MeshMqttClient | null>(null);
  const meshRouterRef = useRef<MeshRouter | null>(null);
  const chunkManagerRef = useRef(getChunkManager());
  const joinedForums = useRef<Set<string>>(new Set());
  // FIX: Référence vers l'interval de polling pour cleanup en cas de démontage pendant connexion
  const statePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ✅ NOUVEAU : Forums découverts
  const [discoveredForums, setDiscoveredForums] = useState<ForumAnnouncement[]>([]);
  // FIX #1: Deduplication — Set des IDs de messages récents (max 200)
  const recentMsgIds = useRef<Set<string>>(new Set());
  // Buffer paquets chiffrés reçus avant de connaître la pubkey du sender
  const pendingEncryptedPackets = useRef<Map<string, MeshCorePacket[]>>(new Map());
  // FIX: Cache des handlers forum (même référence sur reconnexion → dedup fonctionne)
  const forumHandlerRefs = useRef<Map<string, MessageHandler>>(new Map());
  const addToDedup = (id: string) => {
    recentMsgIds.current.add(id);
    if (recentMsgIds.current.size > 200) {
      // Supprimer le plus ancien (premier inséré)
      recentMsgIds.current.delete(recentMsgIds.current.values().next().value as string);
    }
  };

  // Dériver l'identité dès que le wallet est disponible
  useEffect(() => {
    if (mnemonic && !identity) {
      try {
        const id = deriveMeshIdentity(mnemonic);
        
        // Charger le display name depuis la DB
        getUserProfile().then(profile => {
          if (profile?.displayName) {
            id.displayName = profile.displayName;
            console.log('[Messages] Display name chargé:', profile.displayName);
          }
          setIdentity(id);
        }).catch(() => {
          setIdentity(id);
        });
        
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

  // Annoncer notre présence dans le mesh dès que BLE est connecté
  useEffect(() => {
    if (ble.connected && identity) {
      ble.sendSelfAdvert().catch(() => {
        // Silencieux — déjà envoyé dans connect()
      });
      console.log('[MeshCore] SelfAdvert envoyé (présence dans mesh annoncée)');
    }
  }, [ble.connected, identity]);

  // Handler pour paquets MeshCore entrants via BLE → LoRa
  const handleIncomingMeshCorePacket = useCallback(async (packet: MeshCorePacket) => {
    if (!identity) return;

    try {
      console.log('[MeshCore] Paquet reçu via BLE:', {
        type: packet.type,
        fromNodeId: uint64ToNodeId(packet.fromNodeId),
        to: uint64ToNodeId(packet.toNodeId),
        ttl: packet.ttl,
      });

      // Vérifier que le paquet est pour nous (ou broadcast)
      const myNodeIdUint64 = nodeIdToUint64(identity.nodeId);
      if (packet.toNodeId !== myNodeIdUint64 && packet.toNodeId !== 0n) {
        // Forward to gateway if active (LoRa relay mode)
        if (gatewayState.isActive) {
          const rawPayload = JSON.stringify(packet);
          handleLoRaMsg(rawPayload, packet.fromNodeId?.toString() ?? 'unknown');
        }
        return;
      }

      // ✅ Gérer les chunks (messages longs)
      if (isChunkPacket(packet)) {
        const result = chunkManagerRef.current.handleIncomingChunk(packet);
        
        if (result.complete && result.message) {
          // Message complet reconstitué, traiter comme un TEXT normal
          console.log('[MeshCore] Message chunké reconstitué:', result.message.length, 'caractères');
          
          // Créer un paquet TEXT reconstruit pour traitement
          const reconstructedPacket: MeshCorePacket = {
            version: 0x01,
            type: MeshCoreMessageType.TEXT,
            flags: packet.flags,
            ttl: packet.ttl,
            messageId: packet.messageId,
            fromNodeId: packet.fromNodeId,
            toNodeId: packet.toNodeId,
            timestamp: packet.timestamp,
            subMeshId: (packet as any).subMeshId || 0,
            payload: new TextEncoder().encode(result.message),
          };
          
          // Traiter le paquet reconstruit
          console.log('[MeshCore] Traitement du paquet reconstruit:', reconstructedPacket.messageId);
          
          // ✅ Message chunké reconstitué - stocké dans la DB
          const fromNodeId = uint64ToNodeId(packet.fromNodeId);
          // ✅ Récupérer la pubkey depuis le packet ou la conversation
          let senderPubkey = '';
          const existingConv = conversations.find(c => c.id === fromNodeId);
          if (existingConv?.peerPubkey) {
            senderPubkey = existingConv.peerPubkey;
          } else {
            // Essayer d'extraire la pubkey du payload si présente
            try {
              const payloadStr = new TextDecoder().decode(packet.payload);
              if (payloadStr.startsWith('04') || payloadStr.startsWith('02') || payloadStr.startsWith('03')) {
                senderPubkey = payloadStr.slice(0, 66); // Pubkey compressed
                // Sauvegarder la pubkey pour futures utilisations
                updateConversationPubkey(fromNodeId, senderPubkey);
              }
            } catch {
              // Ignorer erreur décodage
            }
          }
          
          const msg: StoredMessage = {
            id: `chunk-${packet.messageId}`,
            conversationId: fromNodeId,
            fromNodeId: fromNodeId,
            fromPubkey: senderPubkey, // ✅ Pubkey récupérée
            text: result.message,
            type: 'text',
            timestamp: packet.timestamp * 1000,
            isMine: false,
            status: 'delivered',
          };
          
          saveMessage(msg);
          updateConversationLastMessage(fromNodeId, result.message.slice(0, 50), msg.timestamp, true);
          
          setMessagesByConv(prev => ({
            ...prev,
            [fromNodeId]: [...(prev[fromNodeId] ?? []), msg],
          }));
          
          // Envoyer ACK
          try {
            const { createAckPacket } = await import('@/utils/meshcore-protocol');
            const ackPacket = createAckPacket(
              identity.nodeId,
              fromNodeId,
              packet.messageId
            );
            await ble.sendPacket(ackPacket);
          } catch (ackErr) {
            console.error('[MeshCore] Erreur envoi ACK:', ackErr);
          }
          
        } else if (result.progress) {
          console.log('[MeshCore] Chunk reçu:', result.progress, '%');
        }
        return;
      }

      // Traiter selon le type de message
      if (packet.type === MeshCoreMessageType.KEY_ANNOUNCE) {
        // ✅ Gérer la réception d'une pubkey
        const { extractPubkeyFromAnnounce } = await import('@/utils/meshcore-protocol');
        const pubkey = extractPubkeyFromAnnounce(packet);
        if (pubkey) {
          const fromNodeId = uint64ToNodeId(packet.fromNodeId);
          console.log('[MeshCore] Pubkey reçue via KEY_ANNOUNCE:', fromNodeId, pubkey.slice(0, 20) + '...');
          updateConversationPubkey(fromNodeId, pubkey);

          // Retry des paquets bufferisés en attente de cette pubkey
          const buffered = pendingEncryptedPackets.current.get(fromNodeId);
          if (buffered && buffered.length > 0) {
            pendingEncryptedPackets.current.delete(fromNodeId);
            console.log(`[MeshCore] Retry ${buffered.length} paquet(s) bufferisé(s) pour ${fromNodeId}`);
            for (const bufferedPkt of buffered) {
              try {
                const enc = decodeEncryptedPayload(bufferedPkt.payload);
                if (!enc) continue;
                const plaintext = decryptDM(enc, identity.privkeyBytes, pubkey);
                const msgId = `mc-${bufferedPkt.messageId}`;
                const msg: StoredMessage = {
                  id: msgId,
                  conversationId: fromNodeId,
                  fromNodeId,
                  fromPubkey: pubkey,
                  text: plaintext,
                  type: 'text',
                  timestamp: bufferedPkt.timestamp * 1000,
                  isMine: false,
                  status: 'delivered',
                };
                saveMessage(msg);
                updateConversationLastMessage(fromNodeId, plaintext.slice(0, 50), msg.timestamp, true);
                setMessagesByConv(prev => ({
                  ...prev,
                  [fromNodeId]: [...(prev[fromNodeId] ?? []), msg],
                }));
              } catch (retryErr) {
                console.error('[MeshCore] Erreur retry paquet bufferisé:', retryErr);
              }
            }
          }
        }
        return;
      }

      if (packet.type === MeshCoreMessageType.TEXT) {
        const fromNodeId = uint64ToNodeId(packet.fromNodeId);

        let plaintext: string;
        let senderPubkey = '';

        // ✅ FIX: Vérifier si le message est chiffré
        if (packet.flags & MeshCoreFlags.ENCRYPTED) {
          // Décoder le payload chiffré
          const enc = decodeEncryptedPayload(packet.payload);
          if (!enc) {
            console.error('[MeshCore] Payload chiffré invalide');
            return;
          }

          // Récupérer la pubkey du sender depuis nos conversations
          const conv = conversations.find(c => c.id === fromNodeId);
          if (!conv?.peerPubkey) {
            // Buffer le paquet — sera retraité quand KEY_ANNOUNCE arrivera
            const existing = pendingEncryptedPackets.current.get(fromNodeId) ?? [];
            if (existing.length < 5) {
              pendingEncryptedPackets.current.set(fromNodeId, [...existing, packet]);
              console.warn(`[MeshCore] Pubkey inconnue pour ${fromNodeId} — paquet bufferisé (${existing.length + 1}/5)`);
            }
            // Envoyer KEY_ANNOUNCE pour demander la pubkey
            try {
              const { createKeyAnnouncePacket } = await import('@/utils/meshcore-protocol');
              const requestPacket = createKeyAnnouncePacket(identity.nodeId, identity.pubkeyHex);
              await ble.sendPacket(requestPacket);
              console.log('[MeshCore] KEY_ANNOUNCE envoyé pour demander la pubkey');
            } catch (err) {
              console.error('[MeshCore] Erreur envoi KEY_ANNOUNCE:', err);
            }
            return;
          }

          senderPubkey = conv.peerPubkey;

          // Déchiffrer avec ECDH
          try {
            plaintext = decryptDM(enc, identity.privkeyBytes, senderPubkey);
          } catch (err) {
            console.error('[MeshCore] Erreur déchiffrement:', err);
            return;
          }
        } else {
          // Message non chiffré (rétrocompatibilité)
          plaintext = extractTextFromPacket(packet);
        }

        const msg: StoredMessage = {
          id: `mc-${packet.messageId}`,
          conversationId: fromNodeId,
          fromNodeId: fromNodeId,
          fromPubkey: senderPubkey,
          text: plaintext,
          type: 'text',
          timestamp: packet.timestamp * 1000, // MeshCore utilise secondes, on veut ms
          isMine: false,
          status: 'delivered',
        };

        saveMessage(msg);
        updateConversationLastMessage(fromNodeId, plaintext.slice(0, 50), msg.timestamp, true);

        // ✅ Envoyer ACK de confirmation
        try {
          const { createAckPacket } = await import('@/utils/meshcore-protocol');
          const ackPacket = createAckPacket(
            identity.nodeId,
            fromNodeId,
            packet.messageId
          );
          await ble.sendPacket(ackPacket);
          console.log('[MeshCore] ACK envoyé pour message', packet.messageId);
        } catch (ackErr) {
          console.error('[MeshCore] Erreur envoi ACK:', ackErr);
        }

        setMessagesByConv(prev => ({
          ...prev,
          [fromNodeId]: [...(prev[fromNodeId] ?? []), msg],
        }));

        // Créer conversation si nécessaire
        setConversations(prev => {
          const exists = prev.find(c => c.id === fromNodeId);
          if (!exists) {
            const newConv: StoredConversation = {
              id: fromNodeId,
              name: fromNodeId,
              isForum: false,
              peerPubkey: senderPubkey || undefined,
              lastMessage: plaintext.slice(0, 50),
              lastMessageTime: msg.timestamp,
              unreadCount: 1,
              online: true,
            };
            saveConversation(newConv);
            return [newConv, ...prev];
          }
          return prev.map(c => {
            if (c.id !== fromNodeId) return c;
            return {
              ...c,
              lastMessage: plaintext.slice(0, 50),
              lastMessageTime: msg.timestamp,
              unreadCount: c.unreadCount + 1,
              peerPubkey: senderPubkey || c.peerPubkey,
              online: true,
            };
          });
        });

        console.log('[MeshCore] Message TEXT déchiffré et livré depuis', fromNodeId);
      } else if (packet.type === MeshCoreMessageType.ACK) {
        // ✅ Traiter l'ACK reçu (confirmation de livraison)
        const fromNodeId = uint64ToNodeId(packet.fromNodeId);
        const { extractAckInfo } = await import('@/utils/meshcore-protocol');
        const ackInfo = extractAckInfo(packet.payload);
        
        if (ackInfo) {
          console.log('[MeshCore] ACK reçu pour message', ackInfo.originalMessageId, 'depuis', fromNodeId);
          
          // Mettre à jour le statut du message local
          const msgId = `mc-${ackInfo.originalMessageId}`;
          setMessagesByConv(prev => {
            const convMessages = prev[fromNodeId] || [];
            const updatedMessages = convMessages.map(m => {
              if (m.id === msgId || m.id.endsWith(`-${ackInfo.originalMessageId}`)) {
                return { ...m, status: 'delivered' as const };
              }
              return m;
            });
            return {
              ...prev,
              [fromNodeId]: updatedMessages,
            };
          });
        }
      } else if (packet.type === (MeshCoreMessageType as any).KEY_ANNOUNCE) {
        // ✅ Traiter l'annonce de clé publique
        const fromNodeId = uint64ToNodeId(packet.fromNodeId);
        const pubkeyHex = extractPubkeyFromAnnounce(packet);
        if (!pubkeyHex) {
          console.error('[MeshCore] KEY_ANNOUNCE invalide');
          return;
        }

        console.log('[MeshCore] Clé publique reçue depuis', fromNodeId, ':', pubkeyHex.slice(0, 16) + '...');

        // Sauvegarder la pubkey dans la conversation
        setConversations(prev => {
          const exists = prev.find(c => c.id === fromNodeId);
          if (exists) {
            // Mettre à jour la pubkey
            const updated = prev.map(c =>
              c.id === fromNodeId ? { ...c, peerPubkey: pubkeyHex, online: true } : c
            );
            // Persister
            const updatedConv = updated.find(c => c.id === fromNodeId);
            if (updatedConv) saveConversation(updatedConv);
            return updated;
          } else {
            // Créer nouvelle conversation
            const newConv: StoredConversation = {
              id: fromNodeId,
              name: fromNodeId,
              isForum: false,
              peerPubkey: pubkeyHex,
              lastMessage: '',
              lastMessageTime: packet.timestamp * 1000,
              unreadCount: 0,
              online: true,
            };
            saveConversation(newConv);
            return [newConv, ...prev];
          }
        });
        
        // ✅ Répondre avec notre propre clé publique (échange bidirectionnel)
        try {
          const announcePacket = createKeyAnnouncePacket(identity.nodeId, identity.pubkeyHex);
          await ble.sendPacket(announcePacket);
          console.log('[MeshCore] Notre clé publique envoyée à', fromNodeId);
        } catch (err) {
          console.error('[MeshCore] Erreur envoi KEY_ANNOUNCE:', err);
        }
      } else if (packet.type === MeshCoreMessageType.POSITION) {
        // ✅ Traiter les paquets GPS (ajouter au radar)
        const position = extractPosition(packet);
        if (position) {
          const fromNodeId = uint64ToNodeId(packet.fromNodeId);
          console.log('[MeshCore] Position reçue de', fromNodeId, ':', position.lat, position.lng);
          
          // Mettre à jour le radar avec la position du pair
          setRadarPeers(prev => {
            const existing = prev.find(p => p.nodeId === fromNodeId);
            if (existing) {
              return prev.map(p => p.nodeId === fromNodeId 
                ? { 
                    ...p, 
                    lat: position.lat, 
                    lng: position.lng, 
                    lastSeen: Date.now(),
                    online: true,
                    signalStrength: 80
                  }
                : p
              );
            } else {
              return [...prev, {
                nodeId: fromNodeId,
                name: fromNodeId,
                lat: position.lat,
                lng: position.lng,
                lastSeen: Date.now(),
                rssi: -80,
                distanceMeters: 0,
                bearingRad: 0,
                online: true,
                signalStrength: 80
              }];
            }
          });
        }
      } else {
        console.log('[MeshCore] Type de paquet non géré:', packet.type);
      }
    } catch (err) {
      console.error('[MeshCore] Erreur traitement paquet:', err);
    }
  }, [identity, gatewayState.isActive, handleLoRaMsg]);

  // Enregistrer le handler BLE dès que possible + annoncer notre clé publique
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];
    
    if (ble.connected && identity) {
      if (__DEV__) console.log('[MeshCore] Connexion BLE établie, enregistrement handler');
      
      // Register packet handler and store unsubscribe function
      const unsubPacket = ble.onPacket(handleIncomingMeshCorePacket);
      unsubscribers.push(unsubPacket);

      // KEY_ANNOUNCE pour les pairs qui utilisent le protocole binaire custom
      const keyAnnounce = createKeyAnnouncePacket(identity.nodeId, identity.pubkeyHex);
      ble.sendPacket(keyAnnounce)
        .then(() => { if (__DEV__) console.log('[MeshCore] KEY_ANNOUNCE envoyé (broadcast)'); })
        .catch(err => console.error('[MeshCore] Erreur envoi KEY_ANNOUNCE:', err));

      // Enregistrer handler pour messages natifs MeshCore Companion (CMD_SEND_TXT_MSG / CMD_SEND_CHAN_MSG)
      const unsubBleMsg = ble.onBleMessage((msg) => {
        const contact = ble.meshContacts.find(c => c.pubkeyPrefix === msg.senderPubkeyPrefix);
        const fromNodeId = contact
          ? `MESH-${msg.senderPubkeyPrefix.slice(0, 8).toUpperCase()}`
          : `BLE-${msg.senderPubkeyPrefix || 'UNKNOWN'}`;
        const convId = msg.type === 'channel'
          ? `forum:ch${msg.channelIdx ?? 0}`
          : fromNodeId;

        const storedMsg: StoredMessage = {
          id: generateMsgId(),
          conversationId: convId,
          fromNodeId,
          text: msg.text,
          type: 'text',
          timestamp: msg.timestamp * 1000,
          isMine: false,
          status: 'delivered',
        };

        saveMessage(storedMsg).catch(console.error);

        setMessagesByConv(prev => ({
          ...prev,
          [convId]: [...(prev[convId] ?? []), storedMsg],
        }));

        setConversations(prev => {
          const exists = prev.find(c => c.id === convId);
          if (!exists) {
            const newConv: StoredConversation = {
              id: convId,
              name: contact?.name ?? fromNodeId,
              isForum: msg.type === 'channel',
              lastMessage: msg.text.slice(0, 50),
              lastMessageTime: storedMsg.timestamp,
              unreadCount: 1,
              online: true,
            };
            saveConversation(newConv).catch(console.error);
            return [newConv, ...prev];
          }
          return prev.map(c => c.id === convId
            ? { ...c, lastMessage: msg.text.slice(0, 50), lastMessageTime: storedMsg.timestamp, unreadCount: c.unreadCount + 1 }
            : c
          );
        });
      });
      unsubscribers.push(unsubBleMsg);
    }
    
    // Cleanup: unsubscribe all handlers when effect re-runs or component unmounts
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [ble.connected, identity, handleIncomingMeshCorePacket]);

  // Charger les conversations depuis AsyncStorage
  useEffect(() => {
    listConversations().then(convs => {
      setConversations(convs);
    });
  }, []);

  // FIX #4: Charger les forums persistés au démarrage
  useEffect(() => {
    AsyncStorage.getItem(JOINED_FORUMS_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved: string[] = JSON.parse(raw);
        saved.forEach(ch => joinedForums.current.add(ch));
        console.log('[Forums] Forums persistés chargés:', saved);
      } catch { /* ignore */ }
    });
  }, []);

  // Demander la permission GPS et tracker notre position
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      console.log('[Radar] Demande permission GPS...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[Radar] Permission GPS:', status);
      if (status !== 'granted') {
        console.log('[Radar] Permission GPS refusée');
        return;
      }
      // Position initiale
      console.log('[Radar] Récupération position initiale...');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      console.log('[Radar] Position obtenue:', loc.coords.latitude, loc.coords.longitude);
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

      // Gateway peer tracking
      if (gatewayState.isActive && peer.online) {
        const gatewayPeer: GatewayPeer = {
          nodeId: peer.nodeId,
          name: peer.name,
          lastSeen: peer.lastSeen,
          signalStrength: peer.signalStrength,
          hops: 1,
          capabilities: [],
          isGateway: false,
        };
        registerPeer(gatewayPeer);
      }
    } catch (err) {
      console.log('[Radar] Erreur parse présence:', err);
    }
  }, [identity, gatewayState.isActive, registerPeer]);

  // Handler pour un message DM entrant
  const handleIncomingDM = useCallback(async (topic: string, payloadStr: string) => {
    if (!identity) return;
    try {
      const wire = JSON.parse(payloadStr) as WireMessage;
      if (wire.from === identity.nodeId) return; // ignorer nos propres messages
      // FIX #1: Deduplication
      if (wire.id && recentMsgIds.current.has(wire.id)) { console.log('[Messages] DM dupliqué ignoré:', wire.id); return; }
      if (wire.id) addToDedup(wire.id);

      // ✅ NOUVEAU : Vérifier que le nodeId correspond à la clé publique
      if (wire.from && wire.fromPubkey) {
        const isValid = verifyNodeId(wire.from, wire.fromPubkey);
        if (!isValid) {
          console.log('[Messages] ALERTE : Usurpation d\'identité détectée !', {
            claimedNodeId: wire.from,
            pubkey: wire.fromPubkey,
          });
          return; // Rejeter le message
        }
      }

      const plaintext = decryptDM(wire.enc, identity.privkeyBytes, wire.fromPubkey);
      
      const fromNodeIdValue = wire.from || wire.fromNodeId || 'unknown';

      // Décoder payload audio/image si nécessaire
      let audioData: string | undefined;
      let audioDuration: number | undefined;
      let imageData: string | undefined;
      let imageMime: string | undefined;
      let displayText = plaintext;

      if (wire.type === 'audio') {
        try {
          const audioPayload = JSON.parse(plaintext) as { dur: number; data: string };
          audioData = audioPayload.data;
          audioDuration = audioPayload.dur;
          displayText = `[Audio ${Math.round(audioDuration / 1000)}s]`;
        } catch {
          displayText = '[Audio]';
        }
      } else if (wire.type === 'image' || wire.type === 'gif') {
        try {
          const imagePayload = JSON.parse(plaintext) as { mime: string; data: string };
          imageData = imagePayload.data;
          imageMime = imagePayload.mime;
          displayText = wire.type === 'gif' ? '[GIF]' : '[Photo]';
        } catch {
          displayText = wire.type === 'gif' ? '[GIF]' : '[Photo]';
        }
      }

      // ✅ NOUVEAU : Validation et stockage des tokens Cashu
      let cashuAmount: number | undefined;
      let cashuTokenStr: string | undefined;

      if (wire.type === 'cashu') {
        try {
          const verification = await verifyCashuToken(plaintext);
          if (verification.valid && verification.token) {
            cashuAmount = verification.amount;
            cashuTokenStr = plaintext;
            
            // Stocker dans le wallet Cashu
            const tokenId = generateTokenId(verification.token);
            await saveCashuToken({
              id: tokenId,
              mintUrl: verification.mintUrl || 'unknown',
              amount: verification.amount || 0,
              token: plaintext,
              proofs: JSON.stringify(verification.token.token[0].proofs),
              source: fromNodeIdValue,
              memo: `Reçu de ${fromNodeIdValue}`,
              state: verification.unverified ? 'unverified' : 'unspent',
              unverified: verification.unverified,
              retryCount: 0,
            });
            console.log('[Cashu] Token validé et stocké:', tokenId, verification.amount, 'sats', verification.unverified ? '(unverified)' : '');
            
            // ✅ NOUVEAU : Notification locale
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '💰 Token Cashu reçu !',
                  body: `${verification.amount} sats de ${fromNodeIdValue.slice(0, 10)}...`,
                  data: { type: 'cashu_received', amount: verification.amount },
                },
                trigger: null, // Immédiat
              });
            } catch (notifErr) {
              console.log('[Cashu] Erreur notification:', notifErr);
            }
          } else {
            console.log('[Cashu] Token invalide reçu:', verification.error);
            // On garde le message mais on marque comme invalide
            cashuAmount = 0;
            cashuTokenStr = plaintext;
          }
        } catch (err) {
          console.log('[Cashu] Erreur validation token:', err);
          cashuAmount = parseCashuAmount(plaintext);
          cashuTokenStr = plaintext;
        }
      }

      // Gateway Cashu relay
      if (wire.type === 'cashu' && cashuTokenStr && gatewayState.isActive && gatewayState.services.cashu) {
        relayCashu(cashuTokenStr, gatewayState.cashuMintUrl, fromNodeIdValue, 'relay');
      }

      const msg: StoredMessage = {
        id: wire.id,
        conversationId: fromNodeIdValue,
        fromNodeId: fromNodeIdValue,
        fromPubkey: wire.fromPubkey,
        text: displayText,
        type: wire.type,
        timestamp: wire.ts,
        isMine: false,
        status: 'delivered',
        cashuAmount,
        cashuToken: cashuTokenStr,
        audioData,
        audioDuration,
        imageData,
        imageMime,
      };

      saveMessage(msg);
      updateConversationLastMessage(fromNodeIdValue, displayText.slice(0, 50), wire.ts, true);

      setMessagesByConv(prev => ({
        ...prev,
        [fromNodeIdValue]: [...(prev[fromNodeIdValue] ?? []), msg],
      }));

      // Créer la conversation si elle n'existe pas encore
      setConversations(prev => {
        const exists = prev.find(c => c.id === fromNodeIdValue);
        if (!exists) {
          const newConv: StoredConversation = {
            id: fromNodeIdValue,
            name: fromNodeIdValue,
            isForum: false,
            peerPubkey: wire.fromPubkey,
            lastMessage: displayText.slice(0, 50),
            lastMessageTime: wire.ts,
            unreadCount: 1,
            online: true,
          };
          saveConversation(newConv);
          return [newConv, ...prev];
        }
        return prev.map(c => {
          if (c.id !== fromNodeIdValue) return c;
          const updated = { ...c, lastMessage: plaintext.slice(0, 50), lastMessageTime: wire.ts, unreadCount: c.unreadCount + 1, peerPubkey: wire.fromPubkey, online: true };
          // Persister la pubkey du pair pour les envois futurs
          if (!c.peerPubkey) saveConversation(updated);
          return updated;
        });
      });
    } catch (err) {
      console.log('[Messages] Erreur déchiffrement DM:', err);
    }
  }, [identity, gatewayState.isActive, gatewayState.services.cashu, gatewayState.cashuMintUrl, relayCashu]);

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
      // FIX #1: Deduplication route
      if (meshMsg.msgId && recentMsgIds.current.has(meshMsg.msgId)) { console.log('[MeshRouter] Message dupliqué ignoré:', meshMsg.msgId); return; }
      if (meshMsg.msgId) addToDedup(meshMsg.msgId);

      // Traiter via MeshRouter (deliver/relay/drop)
      const action = meshRouterRef.current.processIncomingMessage(meshMsg);

      if (action === 'drop') {
        // Message dupliqué ou TTL expiré → ignorer
        return;
      }

      if (action === 'deliver') {
        // Message pour nous → déchiffrer et afficher
        const plaintext = decryptDM(meshMsg.enc as any, identity.privkeyBytes, meshMsg.fromPubkey || '');
        
        const fromNodeIdValue = meshMsg.from || 'unknown';

        const msg: StoredMessage = {
          id: meshMsg.msgId,
          conversationId: fromNodeIdValue,
          fromNodeId: fromNodeIdValue,
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
        updateConversationLastMessage(fromNodeIdValue, plaintext.slice(0, 50), meshMsg.ts, true);

        setMessagesByConv(prev => ({
          ...prev,
          [fromNodeIdValue]: [...(prev[fromNodeIdValue] ?? []), msg],
        }));

        // Créer conversation si nécessaire
        setConversations(prev => {
          const exists = prev.find(c => c.id === fromNodeIdValue);
          if (!exists) {
            const newConv: StoredConversation = {
              id: fromNodeIdValue,
              name: fromNodeIdValue,
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
            if (c.id !== fromNodeIdValue) return c;
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

  // ✅ NOUVEAU : Handler pour les annonces de forums
  const handleForumAnnouncement = useCallback((announcement: ForumAnnouncement) => {
    console.log('[Forums] Nouveau forum découvert:', announcement.channelName, 'par', announcement.creatorNodeId);

    setDiscoveredForums(prev => {
      // Éviter les doublons
      const exists = prev.find(f =>
        f.channelName === announcement.channelName &&
        f.creatorNodeId === announcement.creatorNodeId
      );

      if (exists) return prev;

      // Nouveau forum découvert - afficher notification
      // Note: On utilise setTimeout pour éviter d'afficher pendant le rendu
      setTimeout(() => {
        // Notification simple (peut être remplacée par un toast custom)
        console.log(`[Forums] 🔔 Nouveau forum: #${announcement.channelName} - ${announcement.description}`);
      }, 100);

      // Garder seulement les 50 dernières annonces
      const updated = [announcement, ...prev].slice(0, 50);
      return updated;
    });
  }, []);

  // Handler pour un message forum entrant
  const handleIncomingForum = useCallback((channelName: string) => (topic: string, payloadStr: string) => {
    if (!identity) return;
    try {
      const wire = JSON.parse(payloadStr) as WireMessage;
      const convId = `forum:${channelName}`;

      // FIX #1: Deduplication forum
      if (wire.id && recentMsgIds.current.has(wire.id)) { console.log('[Messages] Forum msg dupliqué ignoré:', wire.id); return; }
      if (wire.id) addToDedup(wire.id);

      // ✅ NOUVEAU : Vérifier que le nodeId correspond à la clé publique
      if (wire.from && wire.fromPubkey) {
        const isValid = verifyNodeId(wire.from, wire.fromPubkey);
        if (!isValid) {
          console.log('[Messages] ALERTE : Usurpation d\'identité dans le forum !', {
            claimedNodeId: wire.from,
            pubkey: wire.fromPubkey,
            channel: channelName,
          });
          return; // Rejeter le message
        }
      }

      let plaintext: string;
      try {
        plaintext = decryptForum(wire.enc, channelName);
      } catch {
        // Déchiffrement impossible — ignorer le message
        console.warn('[Forum] Message non déchiffrable, ignoré');
        return;
      }

      const isMine = wire.from === identity.nodeId;
      // Si le message vient de nous-mêmes, publishAndStore l'a déjà sauvegardé → ignorer l'écho
      if (isMine) return;

      const fromNodeIdValue = wire.from || wire.fromNodeId || 'unknown';

      const msg: StoredMessage = {
        id: wire.id,
        conversationId: convId,
        fromNodeId: fromNodeIdValue,
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

  // FIX BUG 1: Vider le cache des handlers forum quand l'identité change
  useEffect(() => {
    forumHandlerRefs.current.clear();
  }, [handleIncomingForum]);

  // FIX BUG 1: Helper qui retourne TOUJOURS la même référence de handler pour un channel
  // Essentiel pour que subscribeMesh puisse dédupliquer correctement par référence
  const getForumHandler = useCallback((channelName: string): MessageHandler => {
    if (!forumHandlerRefs.current.has(channelName)) {
      forumHandlerRefs.current.set(channelName, handleIncomingForum(channelName));
    }
    return forumHandlerRefs.current.get(channelName)!;
  }, [handleIncomingForum]);

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

    // FIX: Fonction de setup des subscriptions (appelée à chaque reconnexion)
    const setupSubscriptions = () => {
      subscribeMesh(client, TOPICS.dm(identity.nodeId), handleIncomingDM, 1);
      subscribeMesh(client, TOPICS.route(identity.nodeId), handleIncomingRouteMessage, 0);
      subscribePattern(client, 'meshcore/identity/+', handlePeerPresence, 0);
      subscribeForumAnnouncements(client, handleForumAnnouncement);
      const pos = myLocationRef.current;
      updatePresence(client, identity.nodeId, identity.pubkeyHex, pos?.lat, pos?.lng);
      joinedForums.current.forEach(ch => {
        joinForumChannel(client, ch, getForumHandler(ch));
      });
    };

    // FIX: Utiliser l'événement 'connect' du client MQTT.js directement
    // → Se déclenche à CHAQUE connexion (initiale ET reconnexions)
    // → subscribeMesh a maintenant une protection anti-doublons
    client.client?.on('connect', () => {
      console.log('[Messages] MQTT (re)connecté — setup subscriptions');
      setMqttState('connected');
      setupSubscriptions();
    });

    client.client?.on('disconnect', () => setMqttState('disconnected'));
    client.client?.on('offline', () => setMqttState('disconnected'));
    client.client?.on('error', () => setMqttState('error'));
    client.client?.on('reconnect', () => setMqttState('connecting'));

    // Polling léger uniquement pour détecter la connexion initiale si l'événement arrive avant l'enregistrement
    const statePoller = setInterval(() => {
      if (!mqttRef.current) { clearInterval(statePoller); statePollerRef.current = null; return; }
      const s = mqttRef.current.state;
      setMqttState(s);
      if (s !== 'connecting') {
        clearInterval(statePoller);
        statePollerRef.current = null;
      }
    }, 1000);
    statePollerRef.current = statePoller;
  }, [identity, handleIncomingDM, handleIncomingForum, handleIncomingRouteMessage, handlePeerPresence, handleForumAnnouncement, getForumHandler]);

  // Auto-connexion dès que l'identité est disponible
  useEffect(() => {
    if (identity && mqttRef.current === null) {
      connect();
    }
    return () => {
      // FIX: Nettoyer l'interval de polling si le composant se démonte pendant la connexion
      if (statePollerRef.current) {
        clearInterval(statePollerRef.current);
        statePollerRef.current = null;
      }
      if (mqttRef.current) {
        disconnectMesh(mqttRef.current);
        mqttRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]); // connect dépend de identity — on ne se reconnecte qu'une fois par identité

  // ✅ NOUVEAU : Cleanup automatique des messages > 24h toutes les heures
  useEffect(() => {
    // Cleanup immédiat au démarrage
    cleanupOldMessages();
    
    // Puis toutes les heures
    const interval = setInterval(() => {
      cleanupOldMessages();
    }, 60 * 60 * 1000); // 1 heure
    
    return () => clearInterval(interval);
  }, []);

  // ✅ NOUVEAU : Vérification périodique des tokens unverified (P2)
  useEffect(() => {
    async function verifyUnverifiedTokens() {
      try {
        const unverified = await getUnverifiedCashuTokens();
        if (unverified.length === 0) return;
        
        console.log('[Cashu] Vérification de', unverified.length, 'tokens unverified');
        
        for (const token of unverified) {
          try {
            const verification = await verifyCashuToken(token.token);
            if (verification.valid && !verification.unverified) {
              // Token validé !
              await markCashuTokenVerified(token.id);
              console.log('[Cashu] Token vérifié avec succès:', token.id);
            } else if (!verification.valid) {
              // Token invalide
              console.log('[Cashu] Token invalide détecté:', token.id, verification.error);
              await incrementRetryCount(token.id);
            } else {
              // Toujours unverified, incrémenter retry
              await incrementRetryCount(token.id);
            }
          } catch (err) {
            console.log('[Cashu] Erreur vérif token:', token.id, err);
            await incrementRetryCount(token.id);
          }
        }
      } catch (err) {
        console.log('[Cashu] Erreur batch verification:', err);
      }
    }
    
    // Vérifier toutes les 5 minutes
    const interval = setInterval(verifyUnverifiedTokens, 5 * 60 * 1000);
    
    // Vérification immédiate au démarrage
    setTimeout(verifyUnverifiedTokens, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const disconnect = useCallback(() => {
    if (mqttRef.current) {
      disconnectMesh(mqttRef.current);
      mqttRef.current = null;
      setMqttState('disconnected');
    }
  }, []);

  // Publier un message sur le réseau + le sauvegarder localement (déclaré avant sendMessage)
  const publishAndStore = useCallback(async (
    msgId: string,
    convId: string,
    text: string,
    enc: EncryptedPayload,
    topic: string,
    ts: number,
    type: MessageType,
    id: MeshIdentity
  ) => {
    const isDM = topic.startsWith('meshcore/dm/');
    const isForum = convId.startsWith('forum:');

    // **Transport hybride : BLE (LoRa) prioritaire, fallback MQTT**
    // Si BLE connecté ET c'est un DM → utiliser protocole natif MeshCore Companion
    // Le firmware gère le chiffrement E2E et le routing multi-hop
    if (ble.connected && isDM && !isForum) {
      try {
        // Chercher le contact MeshCore correspondant au convId
        const meshContact = ble.meshContacts.find(c =>
          convId.toUpperCase().includes(c.pubkeyPrefix.slice(0, 8).toUpperCase())
        );
        if (meshContact) {
          await ble.sendDirectMessage(meshContact.pubkeyHex, text);
          console.log('[MeshCore] DM natif envoyé via BLE → LoRa:', meshContact.name);
        } else {
          // Fallback : envoyer sur le channel courant (ch0 = public)
          await ble.sendChannelMessage(text);
          console.log('[MeshCore] Message envoyé via channel BLE ch' + ble.currentChannel);
        }
      } catch (err) {
        console.error('[MeshCore] Erreur envoi BLE natif, fallback MQTT:', err);
        // Fallback MQTT si BLE échoue
        if (mqttRef.current && meshRouterRef.current) {
          const meshMsg = meshRouterRef.current.createMessage(convId, enc, id.pubkeyHex, type as 'text' | 'cashu' | 'btc_tx');
          publishMesh(mqttRef.current, TOPICS.route(convId), JSON.stringify(meshMsg), 0);
        }
      }
    } else if (mqttRef.current) {
      // Transport MQTT classique (forums, ou pas de BLE)
      if (isDM && meshRouterRef.current) {
        // DM via MQTT multi-hop routing
        const meshMsg = meshRouterRef.current.createMessage(convId, enc, id.pubkeyHex, type as 'text' | 'cashu' | 'btc_tx');
        publishMesh(mqttRef.current, TOPICS.route(convId), JSON.stringify(meshMsg), 0);
        console.log(`[MeshRouter] Message MQTT envoyé → ${convId} (TTL=${meshMsg.ttl})`);
      } else {
        // Forum : utiliser WireMessage classique
        const wire: WireMessage = {
          v: 1,
          id: msgId,
          from: id.nodeId, // FIX BUG 6: nécessaire pour filtrer l'écho dans handleIncomingForum
          fromNodeId: id.nodeId,
          fromPubkey: id.pubkeyHex,
          to: convId,
          enc,
          ts,
          type,
        };
        publishMesh(mqttRef.current, topic, JSON.stringify(wire), 1);
        console.log('[MQTT] Message forum envoyé:', convId);
      }
    }

    // Sauvegarder localement
    const msg: StoredMessage = {
      id: msgId,
      conversationId: convId,
      fromNodeId: id.nodeId,
      fromPubkey: id.pubkeyHex,
      text,
      type,
      timestamp: ts,
      isMine: true,
      status: 'sent',
      cashuAmount: type === 'cashu' ? parseCashuAmount(text) : undefined,
      cashuToken: type === 'cashu' ? text : undefined,
    };

    // ✅ CORRECTION: try/catch avec await
    try {
      await saveMessage(msg);
      await updateConversationLastMessage(convId, text.slice(0, 50), ts, false);
      console.log('[Messages] Message sauvegardé localement:', msgId);
    } catch (err) {
      console.error('[Messages] Erreur sauvegarde message:', err);
      // On continue quand même pour ne pas bloquer l'UI
    }

    setMessagesByConv(prev => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), msg],
    }));

    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, lastMessage: text.slice(0, 50), lastMessageTime: ts }
        : c
    ));
  }, [ble]);

  // Envoyer un message vocal (MQTT uniquement - trop volumineux pour LoRa)
  const sendAudio = useCallback(async (
    convId: string,
    base64: string,
    durationMs: number
  ): Promise<void> => {
    if (!identity || mqttRef.current?.state !== 'connected') {
      throw new Error('Non connecté au réseau MQTT');
    }

    const id = identity;
    const isForum = convId.startsWith('forum:');
    const msgId = generateMsgId();
    const ts = Date.now();

    // Chiffrer le payload audio (on encode durée + base64 ensemble)
    const audioPayload = JSON.stringify({ dur: durationMs, data: base64 });

    let enc: EncryptedPayload;
    let topic: string;
    if (isForum) {
      const channelName = convId.slice(6);
      enc = encryptForum(audioPayload, channelName);
      topic = TOPICS.forum(channelName);
    } else {
      const conv = conversations.find(c => c.id === convId);
      if (!conv?.peerPubkey) throw new Error('Clé publique du pair inconnue');
      enc = encryptDM(audioPayload, id.privkeyBytes, conv.peerPubkey);
      // FIX BUG 4: audio DM → topic DM direct (WireMessage), pas route (MeshMessage)
      topic = TOPICS.dm(convId);
    }

    // Publier via MQTT uniquement (audio trop volumineux pour LoRa)
    if (mqttRef.current) {
      const wire: WireMessage = {
        v: 1,
        id: msgId,
        from: id.nodeId, // FIX BUG 6: filtre écho dans handleIncomingForum/handleIncomingDM
        fromNodeId: id.nodeId,
        fromPubkey: id.pubkeyHex,
        to: convId,
        enc,
        ts,
        type: 'audio',
      };
      publishMesh(mqttRef.current, topic, JSON.stringify(wire), 1);
    }

    const msg: StoredMessage = {
      id: msgId,
      conversationId: convId,
      fromNodeId: id.nodeId,
      fromPubkey: id.pubkeyHex,
      text: `[Audio ${Math.round(durationMs / 1000)}s]`,
      type: 'audio',
      timestamp: ts,
      isMine: true,
      status: 'sent',
      audioData: base64,
      audioDuration: durationMs,
    };

    try {
      await saveMessage(msg);
      await updateConversationLastMessage(convId, `[Audio ${Math.round(durationMs / 1000)}s]`, ts, false);
    } catch (err) {
      console.error('[Messages] Erreur sauvegarde message audio:', err);
    }

    setMessagesByConv(prev => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), msg],
    }));

    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, lastMessage: `[Audio ${Math.round(durationMs / 1000)}s]`, lastMessageTime: ts }
        : c
    ));
  }, [identity, conversations]);

  // Envoyer une image ou GIF via MQTT (trop volumieux pour LoRa)
  const sendImage = useCallback(async (convId: string, base64: string, mimeType: string): Promise<void> => {
    if (!identity || mqttRef.current?.state !== 'connected') {
      throw new Error('Non connecté au réseau MQTT');
    }

    const id = identity;
    const isForum = convId.startsWith('forum:');
    const msgId = generateMsgId();
    const ts = Date.now();
    const isGif = mimeType === 'image/gif';
    const label = isGif ? '[GIF]' : '[Photo]';

    // Payload = JSON { mime, data }
    const imagePayload = JSON.stringify({ mime: mimeType, data: base64 });

    let enc: EncryptedPayload;
    let topic: string;
    if (isForum) {
      const channelName = convId.slice(6);
      enc = encryptForum(imagePayload, channelName);
      topic = TOPICS.forum(channelName);
    } else {
      const conv = conversations.find(c => c.id === convId);
      if (!conv?.peerPubkey) throw new Error('Clé publique du pair inconnue');
      enc = encryptDM(imagePayload, id.privkeyBytes, conv.peerPubkey);
      topic = TOPICS.route(convId);
    }

    const wire: WireMessage = {
      v: 1,
      id: msgId,
      from: id.nodeId, // FIX BUG 6: filtre écho forum
      fromNodeId: id.nodeId,
      fromPubkey: id.pubkeyHex,
      to: convId,
      enc,
      ts,
      type: isGif ? 'gif' : 'image',
    };
    publishMesh(mqttRef.current, topic, JSON.stringify(wire), 1);

    const msg: StoredMessage = {
      id: msgId,
      conversationId: convId,
      fromNodeId: id.nodeId,
      fromPubkey: id.pubkeyHex,
      text: label,
      type: isGif ? 'gif' : 'image',
      timestamp: ts,
      isMine: true,
      status: 'sent',
      imageData: base64,
      imageMime: mimeType,
    };

    try {
      await saveMessage(msg);
      await updateConversationLastMessage(convId, label, ts, false);
    } catch (err) {
      console.error('[Messages] Erreur sauvegarde image:', err);
    }

    setMessagesByConv(prev => ({
      ...prev,
      [convId]: [...(prev[convId] ?? []), msg],
    }));

    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, lastMessage: label, lastMessageTime: ts } : c
    ));
  }, [identity, conversations]);

  // Envoyer un message (DM ou forum)
  const sendMessage = useCallback(async (
    convId: string,
    text: string,
    type: MessageType = 'text'
  ): Promise<void> => {
    if (!identity) {
      throw new Error('Identité non disponible');
    }
    // FIX BUG 5: autoriser l'envoi via BLE même si MQTT déconnecté
    if (!ble.connected && mqttRef.current?.state !== 'connected') {
      throw new Error('Non connecté — activez le Bluetooth (LoRa) ou vérifiez votre connexion MQTT');
    }

    // ✅ Validation taille message
    const validation = validateMessageSize(text);
    if (!validation.valid) {
      console.warn(`[Messages] Message trop long: ${validation.size}/${validation.max} bytes`);
      // Le chunking sera géré automatiquement ci-dessous
    }

    const id = identity;
    const isForum = convId.startsWith('forum:');
    const msgId = generateMsgId();
    const ts = Date.now();

    // ✅ Utiliser chunking si message trop long (uniquement DM, pas forum)
    if (!isForum && chunkManagerRef.current.needsChunking(text)) {
      console.log('[Messages] Utilisation du chunking pour message long');
      const result = await chunkManagerRef.current.sendMessageWithChunking(
        text,
        id.nodeId,
        convId,
        async (packet) => {
          if (ble.connected) {
            await ble.sendPacket(packet);
          } else {
            throw new Error('BLE non connecté');
          }
        },
        true // encrypted
      );
      
      if (!result.success) {
        throw new Error(`Chunking échoué: ${result.error}`);
      }
      
      console.log(`[Messages] Message envoyé en ${result.chunksSent} chunks`);
      
      // Sauvegarder localement
      const msg: StoredMessage = {
        id: msgId,
        conversationId: convId,
        fromNodeId: id.nodeId,
        fromPubkey: id.pubkeyHex,
        text,
        type,
        timestamp: ts,
        isMine: true,
        status: 'sent',
      };
      
      // ✅ CORRECTION: try/catch pour la sauvegarde
      try {
        await saveMessage(msg);
        await updateConversationLastMessage(convId, text.slice(0, 50), ts, false);
        console.log('[Messages] Message chunk sauvegardé:', msgId);
      } catch (err) {
        console.error('[Messages] Erreur sauvegarde message chunk:', err);
      }
      
      setMessagesByConv(prev => ({
        ...prev,
        [convId]: [...(prev[convId] ?? []), msg],
      }));
      
      return;
    }

    if (isForum) {
      const channelName = convId.slice(6);
      const enc = encryptForum(text, channelName);
      const topic = TOPICS.forum(channelName);
      publishAndStore(msgId, convId, text, enc, topic, ts, type, id);
      return;
    }

    // DM normal (sans chunking)
    const conv = conversations.find(c => c.id === convId);
    if (!conv?.peerPubkey) {
      return new Promise((resolve, reject) => {
        fetchPeerPubkey(mqttRef.current!, convId, (pubkeyHex) => {
          if (!pubkeyHex) {
            reject(new Error('Pair hors ligne — clé publique introuvable'));
            return;
          }
          setConversations(prev => {
            const updated = prev.map(c =>
              c.id === convId ? { ...c, peerPubkey: pubkeyHex } : c
            );
            const updatedConv = updated.find(c => c.id === convId);
            // ✅ CORRECTION: try/catch pour saveConversation
            if (updatedConv) {
              saveConversation(updatedConv).catch(err => {
                console.error('[Messages] Erreur sauvegarde conversation:', err);
              });
            }
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
  }, [identity, conversations, publishAndStore, ble.connected]);

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
    try {
      const msgs = await loadMessages(convId);
      setMessagesByConv(prev => ({ ...prev, [convId]: msgs }));
      console.log('[Messages] Messages chargés pour:', convId, '-', msgs.length, 'messages');
    } catch (err) {
      console.error('[Messages] Erreur chargement messages:', err);
      // Ne pas bloquer l'UI, juste loguer l'erreur
    }
  }, []);

  // Démarrer une nouvelle conversation DM
  const startConversation = useCallback(async (
    peerNodeId: string,
    peerName?: string
  ): Promise<void> => {
    const existing = conversations.find(c => c.id === peerNodeId);
    if (existing) {
      // FIX #3: Si la conv existe mais sans pubkey, tenter une résolution
      if (!existing.peerPubkey && mqttRef.current?.state === 'connected') {
        fetchPeerPubkey(mqttRef.current, peerNodeId, (pubkeyHex) => {
          if (!pubkeyHex) return;
          setConversations(prev => prev.map(c => {
            if (c.id !== peerNodeId || c.peerPubkey) return c;
            const updated = { ...c, peerPubkey: pubkeyHex };
            saveConversation(updated).catch(() => {});
            return updated;
          }));
          console.log('[Messages] Pubkey résolue proactivement pour:', peerNodeId);
        });
      }
      return;
    }

    const conv: StoredConversation = {
      id: peerNodeId,
      name: peerName ?? peerNodeId,
      isForum: false,
      lastMessage: '',
      lastMessageTime: Date.now(),
      unreadCount: 0,
      online: false,
    };
    try {
      await saveConversation(conv);
      setConversations(prev => [conv, ...prev]);
      console.log('[Messages] Conversation démarrée:', peerNodeId);
    } catch (err) {
      console.error('[Messages] Erreur démarrage conversation:', err);
      throw err;
    }

    // FIX #3: Résolution proactive de la pubkey dès la création
    if (mqttRef.current?.state === 'connected') {
      fetchPeerPubkey(mqttRef.current, peerNodeId, (pubkeyHex) => {
        if (!pubkeyHex) return;
        setConversations(prev => prev.map(c => {
          if (c.id !== peerNodeId || c.peerPubkey) return c;
          const updated = { ...c, peerPubkey: pubkeyHex };
          saveConversation(updated).catch(() => {});
          return updated;
        }));
        console.log('[Messages] Pubkey résolue proactivement pour:', peerNodeId);
      });
    }
  }, [conversations]);

  // Rejoindre un forum
  const joinForum = useCallback(async (channelName: string, description?: string): Promise<void> => {
    const convId = `forum:${channelName}`;
    joinedForums.current.add(channelName);
    // FIX #4: Persister la liste des forums rejoints
    AsyncStorage.setItem(JOINED_FORUMS_KEY, JSON.stringify([...joinedForums.current])).catch(() => {});

    if (mqttRef.current?.state === 'connected') {
      joinForumChannel(mqttRef.current, channelName, getForumHandler(channelName));
    }

    const existing = conversations.find(c => c.id === convId);
    if (!existing) {
      const conv: StoredConversation = {
        id: convId,
        name: `#${channelName}`,
        isForum: true,
        lastMessage: description || '',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        online: true,
      };
      // ✅ AJOUT: try/catch pour gérer les erreurs SQLite
      try {
        await saveConversation(conv);
        setConversations(prev => [conv, ...prev]);
        console.log('[Messages] Forum rejoint:', channelName);
      } catch (err) {
        console.error('[Messages] Erreur sauvegarde forum:', err);
        throw err; // Propager l'erreur pour que l'UI puisse l'afficher
      }
    } else {
      console.log('[Messages] Forum déjà existant:', channelName);
    }
  }, [conversations, handleIncomingForum]);

  // ✅ NOUVEAU : Annoncer un forum public
  const announceForumPublic = useCallback((channelName: string, description: string): boolean => {
    if (!mqttRef.current || mqttRef.current.state !== 'connected' || !identity) {
      console.log('[Forums] Impossible d\'annoncer — non connecté, état:', mqttRef.current?.state);
      return false;
    }

    announceForumChannel(
      mqttRef.current,
      channelName,
      description,
      identity.pubkeyHex,
      true
    );

    console.log('[Forums] Forum annoncé publiquement:', channelName);
    return true;
  }, [identity]);

  // ✅ NOUVEAU : Mettre à jour le display name
  const setDisplayName = useCallback(async (name: string): Promise<void> => {
    if (!identity) return;

    // ✅ CORRECTION: try/catch pour setUserProfile
    try {
      await setUserProfile({ displayName: name });
      setIdentity(prev => {
        if (!prev) return null;
        return { ...prev, displayName: name };
      });
      console.log('[Messages] Display name mis à jour:', name);
    } catch (err) {
      console.error('[Messages] Erreur mise à jour display name:', err);
      throw err;
    }
  }, [identity]);

  // Quitter un forum
  const leaveForum = useCallback((channelName: string): void => {
    joinedForums.current.delete(channelName);
    // FIX #4: Persister la liste mise à jour
    AsyncStorage.setItem(JOINED_FORUMS_KEY, JSON.stringify([...joinedForums.current])).catch(() => {});
    if (mqttRef.current) {
      leaveForumChannel(mqttRef.current, channelName);
    }
    console.log('[Messages] Forum quitté:', channelName);
  }, []);

  // Marquer une conversation comme lue
  const markRead = useCallback(async (convId: string): Promise<void> => {
    try {
      await markConversationRead(convId);
      setConversations(prev => prev.map(c =>
        c.id === convId ? { ...c, unreadCount: 0 } : c
      ));
      console.log('[Messages] Conversation marquée comme lue:', convId);
    } catch (err) {
      console.error('[Messages] Erreur markRead:', err);
    }
  }, []);

  // --- Contacts ---
  const refreshContacts = useCallback(async () => {
    const list = await getContacts();
    setContacts(list);
  }, []);

  useEffect(() => { refreshContacts(); }, []);

  const addContact = useCallback(async (nodeId: string, displayName: string, pubkeyHex?: string) => {
    await saveContact({ nodeId, displayName, pubkeyHex, isFavorite: false });
    await refreshContacts();
  }, [refreshContacts]);

  const removeContact = useCallback(async (nodeId: string) => {
    await deleteContact(nodeId);
    await refreshContacts();
  }, [refreshContacts]);

  const toggleFavorite = useCallback(async (nodeId: string) => {
    await toggleContactFavorite(nodeId);
    await refreshContacts();
  }, [refreshContacts]);

  // Supprimer un message localement
  const deleteMessage = useCallback(async (msgId: string, convId: string): Promise<void> => {
    try {
      await deleteMessageDB(msgId);
      setMessagesByConv(prev => ({
        ...prev,
        [convId]: (prev[convId] ?? []).filter(m => m.id !== msgId),
      }));
    } catch (err) {
      console.error('[Messages] Erreur deleteMessage:', err);
    }
  }, []);

  // Supprimer une conversation et tous ses messages (cascade DB)
  const deleteConversation = useCallback(async (convId: string): Promise<void> => {
    try {
      await deleteConversationDB(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      setMessagesByConv(prev => {
        const next = { ...prev };
        delete next[convId];
        return next;
      });
    } catch (err) {
      console.error('[Messages] Erreur deleteConversation:', err);
    }
  }, []);

  return {
    identity,
    mqttState,
    conversations,
    messagesByConv,
    radarPeers,
    myLocation,
    discoveredForums,
    connect,
    disconnect,
    sendMessage,
    sendAudio,
    sendImage,
    sendCashu,
    loadConversationMessages,
    startConversation,
    joinForum,
    leaveForum,
    markRead,
    announceForumPublic,
    setDisplayName,
    deleteMessage,
    deleteConversation,
    contacts,
    addContact,
    removeContact,
    isContact,
    toggleFavorite,
    refreshContacts,
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
