/**
 * Database Service - SQLite wrapper for BitMesh
 * Remplace AsyncStorage pour une persistance robuste
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('bitmesh.db');
    await initDatabase();
  }
  return db;
}

async function initDatabase(): Promise<void> {
  if (!db) return;

  // Table: conversations
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isForum INTEGER NOT NULL DEFAULT 0,
      peerPubkey TEXT,
      lastMessage TEXT,
      lastMessageTime INTEGER NOT NULL DEFAULT 0,
      unreadCount INTEGER NOT NULL DEFAULT 0,
      online INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_conv_time ON conversations(lastMessageTime DESC);
  `);

  // Table: messages
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      fromNodeId TEXT NOT NULL,
      fromPubkey TEXT,
      text TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      timestamp INTEGER NOT NULL,
      isMine INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      cashuAmount INTEGER,
      cashuToken TEXT,
      btcAmount INTEGER,
      compressed INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversationId, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_msg_status ON messages(status) WHERE status IN ('pending', 'sending');
  `);

  // Table: pending_messages (file d'attente retry)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_messages (
      id TEXT PRIMARY KEY,
      packet BLOB NOT NULL,
      retries INTEGER NOT NULL DEFAULT 0,
      maxRetries INTEGER NOT NULL DEFAULT 3,
      nextRetryAt INTEGER NOT NULL,
      error TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_pending_retry ON pending_messages(nextRetryAt) WHERE retries < maxRetries;
  `);

  // Table: key_store (stockage des clés publiques des pairs)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS key_store (
      nodeId TEXT PRIMARY KEY,
      pubkeyHex TEXT NOT NULL,
      firstSeen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      lastSeen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      trustLevel INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Table: message_counters (pour IDs uniques)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS message_counters (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      counter INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO message_counters (id, counter) VALUES (1, 0);
  `);

  // Table: app_state (pour état global)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  console.log('[Database] Tables initialisées');
}

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
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(`
    SELECT * FROM conversations 
    ORDER BY lastMessageTime DESC
  `);
  return rows.map(row => ({
    ...row,
    isForum: Boolean(row.isForum),
    online: Boolean(row.online),
  }));
}

export async function saveConversationDB(conv: DBConversation): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    INSERT INTO conversations (id, name, isForum, peerPubkey, lastMessage, lastMessageTime, unreadCount, online, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now') * 1000)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      isForum = excluded.isForum,
      peerPubkey = excluded.peerPubkey,
      lastMessage = excluded.lastMessage,
      lastMessageTime = excluded.lastMessageTime,
      unreadCount = excluded.unreadCount,
      online = excluded.online,
      updatedAt = excluded.updatedAt
  `, [
    conv.id,
    conv.name,
    conv.isForum ? 1 : 0,
    conv.peerPubkey || null,
    conv.lastMessage || null,
    conv.lastMessageTime,
    conv.unreadCount,
    conv.online ? 1 : 0,
  ]);
}

export async function updateConversationLastMessageDB(
  convId: string,
  lastMessage: string,
  ts: number,
  incrementUnread: boolean
): Promise<void> {
  const database = await getDatabase();
  if (incrementUnread) {
    await database.runAsync(`
      UPDATE conversations 
      SET lastMessage = ?, lastMessageTime = ?, unreadCount = unreadCount + 1, updatedAt = strftime('%s', 'now') * 1000
      WHERE id = ?
    `, [lastMessage, ts, convId]);
  } else {
    await database.runAsync(`
      UPDATE conversations 
      SET lastMessage = ?, lastMessageTime = ?, updatedAt = strftime('%s', 'now') * 1000
      WHERE id = ?
    `, [lastMessage, ts, convId]);
  }
}

export async function markConversationReadDB(convId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    UPDATE conversations SET unreadCount = 0, updatedAt = strftime('%s', 'now') * 1000 WHERE id = ?
  `, [convId]);
}

// --- Messages ---

export interface DBMessage {
  id: string;
  conversationId: string;
  fromNodeId: string;
  fromPubkey?: string;
  text: string;
  type: 'text' | 'cashu' | 'btc_tx' | 'lora';
  timestamp: number;
  isMine: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  cashuAmount?: number;
  cashuToken?: string;
  btcAmount?: number;
  compressed?: boolean;
}

export async function loadMessagesDB(convId: string, limit: number = 200): Promise<DBMessage[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(`
    SELECT * FROM messages 
    WHERE conversationId = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `, [convId, limit]);
  return rows.reverse().map(row => ({
    ...row,
    isMine: Boolean(row.isMine),
    compressed: Boolean(row.compressed),
  }));
}

export async function saveMessageDB(msg: DBMessage): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    INSERT OR REPLACE INTO messages 
    (id, conversationId, fromNodeId, fromPubkey, text, type, timestamp, isMine, status, cashuAmount, cashuToken, btcAmount, compressed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    msg.id,
    msg.conversationId,
    msg.fromNodeId,
    msg.fromPubkey || null,
    msg.text,
    msg.type,
    msg.timestamp,
    msg.isMine ? 1 : 0,
    msg.status,
    msg.cashuAmount || null,
    msg.cashuToken || null,
    msg.btcAmount || null,
    msg.compressed ? 1 : 0,
  ]);
}

export async function updateMessageStatusDB(
  msgId: string,
  status: DBMessage['status']
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    UPDATE messages SET status = ? WHERE id = ?
  `, [status, msgId]);
}

// --- Pending Messages (Retry Queue) ---

export interface PendingMessage {
  id: string;
  packet: Uint8Array;
  retries: number;
  maxRetries: number;
  nextRetryAt: number;
  error?: string;
}

export async function queuePendingMessage(
  id: string,
  packet: Uint8Array,
  maxRetries: number = 3
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    INSERT INTO pending_messages (id, packet, retries, maxRetries, nextRetryAt)
    VALUES (?, ?, 0, ?, strftime('%s', 'now') * 1000)
    ON CONFLICT(id) DO UPDATE SET
      retries = retries + 1,
      nextRetryAt = strftime('%s', 'now') * 1000 + (1000 * (retries + 1) * (retries + 1))
  `, [id, Buffer.from(packet).toString('base64'), maxRetries]);
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  const database = await getDatabase();
  const now = Date.now();
  const rows = await database.getAllAsync<any>(`
    SELECT * FROM pending_messages 
    WHERE retries < maxRetries AND nextRetryAt <= ?
    ORDER BY nextRetryAt ASC
  `, [now]);
  return rows.map(row => ({
    ...row,
    packet: Uint8Array.from(Buffer.from(row.packet, 'base64')),
  }));
}

export async function removePendingMessage(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM pending_messages WHERE id = ?`, [id]);
}

export async function incrementRetryCount(id: string, error?: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    UPDATE pending_messages 
    SET retries = retries + 1, 
        nextRetryAt = strftime('%s', 'now') * 1000 + (1000 * (retries + 1) * (retries + 1)),
        error = ?
    WHERE id = ?
  `, [error || null, id]);
}

// --- Key Store ---

export async function savePubkey(nodeId: string, pubkeyHex: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    INSERT INTO key_store (nodeId, pubkeyHex, lastSeen)
    VALUES (?, ?, strftime('%s', 'now') * 1000)
    ON CONFLICT(nodeId) DO UPDATE SET
      pubkeyHex = excluded.pubkeyHex,
      lastSeen = excluded.lastSeen
  `, [nodeId, pubkeyHex]);
}

export async function getPubkey(nodeId: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ pubkeyHex: string }>(`
    SELECT pubkeyHex FROM key_store WHERE nodeId = ?
  `, [nodeId]);
  return row?.pubkeyHex || null;
}

// --- Message Counter (pour IDs uniques) ---

export async function getNextMessageId(): Promise<number> {
  const database = await getDatabase();
  await database.runAsync(`
    UPDATE message_counters SET counter = counter + 1 WHERE id = 1
  `);
  const row = await database.getFirstAsync<{ counter: number }>(`
    SELECT counter FROM message_counters WHERE id = 1
  `);
  return row?.counter || 0;
}

// --- App State ---

export async function setAppState(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`
    INSERT INTO app_state (key, value, updatedAt)
    VALUES (?, ?, strftime('%s', 'now') * 1000)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `, [key, value]);
}

export async function getAppState(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(`
    SELECT value FROM app_state WHERE key = ?
  `, [key]);
  return row?.value || null;
}

// --- Migration depuis AsyncStorage ---

export async function migrateFromAsyncStorage(): Promise<void> {
  // Cette fonction sera appelée au démarrage pour migrer les données existantes
  console.log('[Database] Migration depuis AsyncStorage si nécessaire...');
  // TODO: Implémenter la migration si des données existent dans AsyncStorage
}
