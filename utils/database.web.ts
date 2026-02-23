/**
 * Database Service - Web fallback using AsyncStorage
 * expo-sqlite WASM doesn't work with Metro on web, so we use AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  conversations: 'meshcore_conversations',
  messages: 'meshcore_messages',
  pending: 'meshcore_pending',
  tokens: 'meshcore_cashu_tokens',
  profile: 'meshcore_user_profile',
  keys: 'meshcore_key_store',
  contacts: 'meshcore_contacts',
  appState: 'meshcore_app_state',
};

async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setItem<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getDatabase(): Promise<any> {
  return {
    execAsync: async () => {},
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    runAsync: async () => ({ lastInsertRowId: 1, changes: 1 }),
  };
}

export async function resetDatabase(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

export async function migrateFromAsyncStorage(): Promise<void> {}

// --- Conversations ---

export interface DBConversation {
  id: string;
  name: string;
  isForum: boolean;
  peerPubkey?: string;
  lastMessage?: string;
  lastMessageTime: number;
  unreadCount: number;
  online: boolean;
}

export async function listConversationsDB(): Promise<DBConversation[]> {
  return getItem(KEYS.conversations, []);
}

export async function saveConversationDB(conv: DBConversation): Promise<void> {
  const convs = await listConversationsDB();
  const idx = convs.findIndex(c => c.id === conv.id);
  if (idx >= 0) convs[idx] = conv;
  else convs.push(conv);
  await setItem(KEYS.conversations, convs);
}

export async function updateConversationLastMessageDB(
  convId: string,
  lastMessage: string,
  ts: number,
  incrementUnread: boolean = false
): Promise<void> {
  const convs = await listConversationsDB();
  const conv = convs.find(c => c.id === convId);
  if (conv) {
    conv.lastMessage = lastMessage;
    conv.lastMessageTime = ts;
    if (incrementUnread) conv.unreadCount++;
    await setItem(KEYS.conversations, convs);
  }
}

export async function markConversationReadDB(convId: string): Promise<void> {
  const convs = await listConversationsDB();
  const conv = convs.find(c => c.id === convId);
  if (conv) {
    conv.unreadCount = 0;
    await setItem(KEYS.conversations, convs);
  }
}

export async function deleteConversationDB(convId: string): Promise<void> {
  const convs = await listConversationsDB();
  await setItem(KEYS.conversations, convs.filter(c => c.id !== convId));
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  await setItem(KEYS.messages, msgs.filter(m => m.conversationId !== convId));
  console.log('[DB-Web] Conversation supprimée:', convId);
}

// --- Messages ---

export interface DBMessage {
  id: string;
  conversationId: string;
  fromNodeId: string;
  fromPubkey?: string;
  text: string;
  type: 'text' | 'cashu' | 'btc_tx' | 'lora' | 'audio' | 'image' | 'gif';
  timestamp: number;
  isMine: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  cashuAmount?: number;
  cashuToken?: string;
  btcAmount?: number;
  compressed?: boolean;
  audioData?: string;
  audioDuration?: number;
  imageData?: string;
  imageMime?: string;
}

export async function loadMessagesDB(convId: string, limit: number = 200): Promise<DBMessage[]> {
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  return msgs
    .filter(m => m.conversationId === convId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .reverse();
}

export async function saveMessageDB(msg: DBMessage): Promise<void> {
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  const idx = msgs.findIndex(m => m.id === msg.id);
  if (idx >= 0) msgs[idx] = msg;
  else msgs.push(msg);
  await setItem(KEYS.messages, msgs);
}

export async function updateMessageStatusDB(msgId: string, status: DBMessage['status']): Promise<void> {
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  const msg = msgs.find(m => m.id === msgId);
  if (msg) {
    msg.status = status;
    await setItem(KEYS.messages, msgs);
  }
}

export async function deleteMessageDB(msgId: string): Promise<void> {
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  await setItem(KEYS.messages, msgs.filter(m => m.id !== msgId));
  console.log('[DB-Web] Message supprimé:', msgId);
}

export async function cleanupOldMessages(): Promise<number> {
  const msgs = await getItem<DBMessage[]>(KEYS.messages, []);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = msgs.filter(m => m.timestamp > cutoff);
  const deleted = msgs.length - filtered.length;
  await setItem(KEYS.messages, filtered);
  return deleted;
}

// --- Contacts ---

export interface DBContact {
  nodeId: string;
  displayName: string;
  pubkeyHex?: string;
  notes?: string;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
}

export async function saveContact(contact: Omit<DBContact, 'addedAt' | 'updatedAt'>): Promise<void> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  const now = Date.now();
  const idx = contacts.findIndex(c => c.nodeId === contact.nodeId);
  const fullContact: DBContact = { ...contact, addedAt: now, updatedAt: now };
  if (idx >= 0) {
    fullContact.addedAt = contacts[idx].addedAt;
    contacts[idx] = fullContact;
  } else {
    contacts.push(fullContact);
  }
  await setItem(KEYS.contacts, contacts);
  console.log('[DB-Web] Contact sauvegardé:', contact.nodeId);
}

export async function getContacts(): Promise<DBContact[]> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  return contacts.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export async function isContact(nodeId: string): Promise<boolean> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  return contacts.some(c => c.nodeId === nodeId);
}

export async function deleteContact(nodeId: string): Promise<void> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  await setItem(KEYS.contacts, contacts.filter(c => c.nodeId !== nodeId));
  console.log('[DB-Web] Contact supprimé:', nodeId);
}

export async function updateContactName(nodeId: string, displayName: string): Promise<void> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  const contact = contacts.find(c => c.nodeId === nodeId);
  if (contact) {
    contact.displayName = displayName;
    contact.updatedAt = Date.now();
    await setItem(KEYS.contacts, contacts);
  }
}

export async function toggleContactFavorite(nodeId: string): Promise<void> {
  const contacts = await getItem<DBContact[]>(KEYS.contacts, []);
  const contact = contacts.find(c => c.nodeId === nodeId);
  if (contact) {
    contact.isFavorite = !contact.isFavorite;
    contact.updatedAt = Date.now();
    await setItem(KEYS.contacts, contacts);
  }
}

// --- Pending Messages ---

export interface PendingMessage {
  id: string;
  packet: Uint8Array;
  retries: number;
  maxRetries: number;
  nextRetryAt: number;
  error?: string;
}

export async function queuePendingMessage(id: string, packet: Uint8Array, maxRetries: number = 3): Promise<void> {
  const pending = await getItem<PendingMessage[]>(KEYS.pending, []);
  pending.push({ id, packet, retries: 0, maxRetries, nextRetryAt: Date.now() });
  await setItem(KEYS.pending, pending);
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  const pending = await getItem<PendingMessage[]>(KEYS.pending, []);
  const now = Date.now();
  return pending.filter(p => p.retries < p.maxRetries && p.nextRetryAt <= now);
}

export async function removePendingMessage(id: string): Promise<void> {
  const pending = await getItem<PendingMessage[]>(KEYS.pending, []);
  await setItem(KEYS.pending, pending.filter(p => p.id !== id));
}

export async function incrementRetryCount(id: string, error?: string): Promise<void> {
  const pending = await getItem<PendingMessage[]>(KEYS.pending, []);
  const msg = pending.find(p => p.id === id);
  if (msg) {
    msg.retries++;
    msg.error = error;
    msg.nextRetryAt = Date.now() + 1000 * msg.retries * msg.retries;
    await setItem(KEYS.pending, pending);
  }
}

// --- Cashu Tokens ---

export interface DBCashuToken {
  id: string;
  mintUrl: string;
  amount: number;
  token: string;
  proofs: string;
  keysetId?: string;
  receivedAt: number;
  state: 'unspent' | 'pending' | 'spent' | 'unverified';
  spentAt?: number;
  source?: string;
  memo?: string;
  unverified?: boolean;
  retryCount?: number;
  lastCheckAt?: number;
}

export async function saveCashuToken(token: Omit<DBCashuToken, 'receivedAt'>): Promise<void> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const idx = tokens.findIndex(t => t.id === token.id);
  const fullToken = { ...token, receivedAt: Date.now() } as DBCashuToken;
  if (idx >= 0) tokens[idx] = fullToken;
  else tokens.push(fullToken);
  await setItem(KEYS.tokens, tokens);
}

export async function getUnspentCashuTokens(): Promise<DBCashuToken[]> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  return tokens.filter(t => t.state === 'unspent' || t.state === 'unverified');
}

export async function markCashuTokenSpent(id: string): Promise<void> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const token = tokens.find(t => t.id === id);
  if (token) {
    token.state = 'spent';
    token.spentAt = Date.now();
    await setItem(KEYS.tokens, tokens);
  }
}

export async function markCashuTokenPending(id: string): Promise<void> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const token = tokens.find(t => t.id === id);
  if (token) {
    token.state = 'pending';
    await setItem(KEYS.tokens, tokens);
  }
}

export async function markCashuTokenUnspent(id: string): Promise<void> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const token = tokens.find(t => t.id === id);
  if (token) {
    token.state = 'unspent';
    await setItem(KEYS.tokens, tokens);
  }
}

export async function markCashuTokenVerified(id: string): Promise<void> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const token = tokens.find(t => t.id === id);
  if (token) {
    token.state = 'unspent';
    token.unverified = false;
    await setItem(KEYS.tokens, tokens);
  }
}

export async function getCashuTokenById(id: string): Promise<DBCashuToken | null> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  return tokens.find(t => t.id === id) || null;
}

export async function getCashuBalance(): Promise<{ total: number; byMint: Record<string, number> }> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  const unspent = tokens.filter(t => t.state === 'unspent' || t.state === 'unverified');
  const total = unspent.reduce((sum, t) => sum + t.amount, 0);
  const byMint: Record<string, number> = {};
  for (const t of unspent) {
    byMint[t.mintUrl] = (byMint[t.mintUrl] || 0) + t.amount;
  }
  return { total, byMint };
}

export async function getAllMints(): Promise<string[]> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  return [...new Set(tokens.map(t => t.mintUrl))];
}

export async function getTokensByMint(mintUrl: string): Promise<DBCashuToken[]> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  return tokens.filter(t => t.mintUrl === mintUrl && (t.state === 'unspent' || t.state === 'unverified'));
}

export async function exportCashuTokens(): Promise<DBCashuToken[]> {
  return getItem<DBCashuToken[]>(KEYS.tokens, []);
}

export async function importCashuTokens(tokens: DBCashuToken[]): Promise<number> {
  await setItem(KEYS.tokens, tokens);
  return tokens.length;
}

export async function getUnverifiedCashuTokens(): Promise<DBCashuToken[]> {
  const tokens = await getItem<DBCashuToken[]>(KEYS.tokens, []);
  return tokens.filter(t => t.state === 'unverified');
}

// --- User Profile ---

export interface UserProfile {
  displayName: string | null;
  statusMessage: string | null;
  avatarEmoji: string | null;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  return getItem(KEYS.profile, null);
}

export async function setUserProfile(profile: Partial<UserProfile>): Promise<void> {
  const existing = await getUserProfile();
  await setItem(KEYS.profile, { ...existing, ...profile });
}

// --- Key Store ---

export async function savePubkey(nodeId: string, pubkeyHex: string): Promise<void> {
  const keys = await getItem<Record<string, string>>(KEYS.keys, {});
  keys[nodeId] = pubkeyHex;
  await setItem(KEYS.keys, keys);
}

export async function getPubkey(nodeId: string): Promise<string | null> {
  const keys = await getItem<Record<string, string>>(KEYS.keys, {});
  return keys[nodeId] || null;
}

// --- Message Counter ---

export async function getNextMessageId(): Promise<number> {
  const key = 'meshcore_msg_counter';
  const current = parseInt(await AsyncStorage.getItem(key) || '0', 10);
  const next = current + 1;
  await AsyncStorage.setItem(key, next.toString());
  return next;
}

// --- App State ---

export async function setAppState(key: string, value: string): Promise<void> {
  const state = await getItem<Record<string, string>>(KEYS.appState, {});
  state[key] = value;
  await setItem(KEYS.appState, state);
}

export async function getAppState(key: string): Promise<string | null> {
  const state = await getItem<Record<string, string>>(KEYS.appState, {});
  return state[key] || null;
}

// --- MQTT Queue ---

export interface DBMqttQueueItem {
  id: number;
  topic: string;
  payload: string;
  qos: number;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  nextRetryAt: number;
}

export async function enqueueMqttMessage(_topic: string, _payload: string, _qos: number = 1, _maxRetries: number = 3): Promise<number> {
  return 1;
}

export async function getPendingMqttMessages(): Promise<DBMqttQueueItem[]> {
  return [];
}

export async function markMqttMessageSent(_id: number): Promise<void> {}
export async function incrementMqttRetry(_id: number): Promise<void> {}

// --- Sub-meshes ---

export interface DBSubMesh {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  isDefault: boolean;
  autoJoin: boolean;
  requireInvite: boolean;
  maxHops: number;
  parentMesh?: string;
  createdAt: number;
}

export interface DBSubMeshPeer {
  nodeId: string;
  submeshId: string;
  rssi: number;
  lastSeen: number;
  hops: number;
  isBridge: boolean;
}

export async function saveSubMeshDB(_submesh: DBSubMesh): Promise<void> {}
export async function getSubMeshesDB(): Promise<DBSubMesh[]> { return []; }
export async function deleteSubMeshDB(_id: string): Promise<void> {}
export async function saveSubMeshPeerDB(_peer: DBSubMeshPeer): Promise<void> {}
export async function getSubMeshPeersDB(_submeshId: string): Promise<DBSubMeshPeer[]> { return []; }
