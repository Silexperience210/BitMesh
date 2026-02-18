// Persistance des messages dans AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_MESSAGES_PER_CONV = 200;
const CONV_LIST_KEY = 'meshcore_conversations';
const MSG_PREFIX = 'meshcore_msgs_';

export type MessageType = 'text' | 'cashu' | 'btc_tx' | 'lora';

export interface StoredMessage {
  id: string;
  conversationId: string;  // peerNodeId ou "forum:channelName"
  from: string;            // nodeId expéditeur
  fromPubkey: string;      // pubkey hex expéditeur
  text: string;            // contenu déchiffré
  type: MessageType;
  timestamp: number;
  isMine: boolean;
  status: 'sent' | 'delivered' | 'pending' | 'failed';
  // Données optionnelles pour tokens/paiements
  cashuAmount?: number;
  cashuToken?: string;
  btcAmount?: number;
}

export interface StoredConversation {
  id: string;              // peerNodeId ou "forum:channelName"
  name: string;            // nom affiché
  isForum: boolean;
  peerPubkey?: string;     // clé publique du pair (pour DMs)
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  online: boolean;
}

// --- Conversations ---

export async function listConversations(): Promise<StoredConversation[]> {
  try {
    const raw = await AsyncStorage.getItem(CONV_LIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredConversation[];
  } catch (err) {
    console.log('[MessagesStore] Erreur chargement conversations:', err);
    return [];
  }
}

export async function saveConversation(conv: StoredConversation): Promise<void> {
  try {
    const list = await listConversations();
    const idx = list.findIndex(c => c.id === conv.id);
    if (idx >= 0) {
      list[idx] = conv;
    } else {
      list.unshift(conv);
    }
    await AsyncStorage.setItem(CONV_LIST_KEY, JSON.stringify(list));
  } catch (err) {
    console.log('[MessagesStore] Erreur sauvegarde conversation:', err);
  }
}

export async function updateConversationLastMessage(
  convId: string,
  lastMessage: string,
  ts: number,
  incrementUnread: boolean
): Promise<void> {
  const list = await listConversations();
  const conv = list.find(c => c.id === convId);
  if (conv) {
    conv.lastMessage = lastMessage;
    conv.lastMessageTime = ts;
    if (incrementUnread) conv.unreadCount = (conv.unreadCount || 0) + 1;
    await AsyncStorage.setItem(CONV_LIST_KEY, JSON.stringify(list));
  }
}

export async function markConversationRead(convId: string): Promise<void> {
  const list = await listConversations();
  const conv = list.find(c => c.id === convId);
  if (conv) {
    conv.unreadCount = 0;
    await AsyncStorage.setItem(CONV_LIST_KEY, JSON.stringify(list));
  }
}

// --- Messages ---

export async function loadMessages(convId: string): Promise<StoredMessage[]> {
  try {
    const key = MSG_PREFIX + convId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as StoredMessage[];
  } catch (err) {
    console.log('[MessagesStore] Erreur chargement messages:', err);
    return [];
  }
}

export async function saveMessage(msg: StoredMessage): Promise<void> {
  try {
    const key = MSG_PREFIX + msg.conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const messages = await loadMessages(msg.conversationId);

    // Dédoublonner par id
    const exists = messages.some(m => m.id === msg.id);
    if (exists) return;

    messages.push(msg);

    // Garder seulement les MAX_MESSAGES_PER_CONV derniers
    const trimmed = messages.slice(-MAX_MESSAGES_PER_CONV);
    await AsyncStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    console.log('[MessagesStore] Erreur sauvegarde message:', err);
  }
}

export async function updateMessageStatus(
  convId: string,
  msgId: string,
  status: StoredMessage['status']
): Promise<void> {
  try {
    const messages = await loadMessages(convId);
    const msg = messages.find(m => m.id === msgId);
    if (msg) {
      msg.status = status;
      const key = MSG_PREFIX + convId.replace(/[^a-zA-Z0-9_-]/g, '_');
      await AsyncStorage.setItem(key, JSON.stringify(messages));
    }
  } catch (err) {
    console.log('[MessagesStore] Erreur update status:', err);
  }
}

// Générer un ID unique pour les messages
export function generateMsgId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
