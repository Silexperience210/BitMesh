/**
 * Database Service - SQLite wrapper for BitMesh
 * Remplace AsyncStorage pour une persistance robuste
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    try {
      db = await SQLite.openDatabaseAsync('bitmesh.db');
      await initDatabase();
    } catch (error) {
      console.error('[Database] Erreur ouverture:', error);
      initAttempts++;
      
      if (initAttempts >= MAX_INIT_ATTEMPTS) {
        console.error('[Database] Trop de tentatives, reset de la base...');
        await resetDatabase();
        initAttempts = 0;
      } else {
        throw error;
      }
    }
  }
  return db;
}

/**
 * Reset la base de données en cas de corruption
 */
export async function resetDatabase(): Promise<void> {
  try {
    if (db) {
      await db.closeAsync();
      db = null;
    }
    
    // Supprimer et recréer
    console.log('[Database] Reset de la base...');
    db = await SQLite.openDatabaseAsync('bitmesh.db');
    
    // Drop all tables
    await db.execAsync(`
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS pending_messages;
      DROP TABLE IF EXISTS key_store;
      DROP TABLE IF EXISTS message_counters;
      DROP TABLE IF EXISTS app_state;
    `);
    
    // Recréer
    await initDatabase();
    console.log('[Database] Base reset et recréée');
  } catch (error) {
    console.error('[Database] Erreur reset:', error);
    throw error;
  }
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
  console.log('[Database] Vérification migration depuis AsyncStorage...');
  
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    
    // Vérifier si migration déjà faite
    const migrationDone = await AsyncStorage.getItem('meshcore_migration_done');
    if (migrationDone === 'true') {
      console.log('[Database] Migration déjà effectuée');
      return;
    }
    
    const db = await getDatabase();
    
    // Vérifier si des conversations existent déjà dans SQLite
    const existingConvs = await db.getAllAsync('SELECT COUNT(*) as count FROM conversations');
    const hasConversations = (existingConvs[0] as any).count > 0;
    
    if (hasConversations) {
      console.log('[Database] Données SQLite existantes, pas de migration nécessaire');
      await AsyncStorage.setItem('meshcore_migration_done', 'true');
      return;
    }
    
    // Migrer les conversations
    const convsJson = await AsyncStorage.getItem('meshcore_conversations');
    if (convsJson) {
      const conversations = JSON.parse(convsJson);
      console.log(`[Database] Migration de ${conversations.length} conversations...`);
      
      for (const conv of conversations) {
        await db.runAsync(
          `INSERT OR IGNORE INTO conversations 
           (id, name, is_forum, peer_pubkey, last_message, last_message_time, unread_count, online)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            conv.id,
            conv.name,
            conv.isForum ? 1 : 0,
            conv.peerPubkey || null,
            conv.lastMessage || '',
            conv.lastMessageTime || Date.now(),
            conv.unreadCount || 0,
            conv.online ? 1 : 0
          ]
        );
      }
      console.log('[Database] Conversations migrées');
    }
    
    // Migrer les messages
    const messagesJson = await AsyncStorage.getItem('meshcore_messages');
    if (messagesJson) {
      const messages = JSON.parse(messagesJson);
      console.log(`[Database] Migration de ${messages.length} messages...`);
      
      for (const msg of messages) {
        await db.runAsync(
          `INSERT OR IGNORE INTO messages 
           (id, conversation_id, from_node_id, from_pubkey, text, type, timestamp, is_mine, status, cashu_amount, cashu_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            msg.id,
            msg.conversationId,
            msg.from,
            msg.fromPubkey || null,
            msg.text,
            msg.type,
            msg.timestamp,
            msg.isMine ? 1 : 0,
            msg.status,
            msg.cashuAmount || null,
            msg.cashuToken || null
          ]
        );
      }
      console.log('[Database] Messages migrés');
    }
    
    // Marquer la migration comme terminée
    await AsyncStorage.setItem('meshcore_migration_done', 'true');
    console.log('[Database] Migration terminée avec succès');
    
  } catch (error) {
    console.error('[Database] Erreur migration:', error);
    throw error;
  }
}
