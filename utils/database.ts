/**
 * Database Service - SQLite wrapper for BitMesh
 * Remplace AsyncStorage pour une persistance robuste
 */
import * as SQLite from 'expo-sqlite';

// ✅ UTILITAIRE: Remplacer Buffer pour React Native
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary.split('').map(c => c.charCodeAt(0)));
}

// ✅ UTILITAIRE: Convertir les paramètres pour SQLite
function toSQLiteParams(params: any[]): any[] {
  return params.map(p => {
    if (p === null || p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number') return Math.floor(p);
    if (typeof p === 'string') return p;
    if (p instanceof Uint8Array) return uint8ArrayToBase64(p);
    // ✅ CORRECTION: Convertir les objets en JSON string
    if (typeof p === 'object') return JSON.stringify(p);
    return String(p);
  });
}

let db: SQLite.SQLiteDatabase | null = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    try {
      // ✅ AJOUT: Délai pour laisser le temps à SQLite de s'initialiser
      await new Promise(resolve => setTimeout(resolve, 100));
      db = await SQLite.openDatabaseAsync('bitmesh.db');
      await initDatabase();
      // ✅ VÉRIFICATION: db est bien initialisé après initDatabase
      if (!db) {
        throw new Error('Database initialization failed - db is null after init');
      }
    } catch (error) {
      console.error('[Database] Erreur ouverture:', error);
      initAttempts++;
      
      if (initAttempts >= MAX_INIT_ATTEMPTS) {
        console.error('[Database] Trop de tentatives, reset de la base...');
        await resetDatabase();
        initAttempts = 0;
        // ✅ VÉRIFICATION après reset
        if (!db) {
          throw new Error('Database still null after reset');
        }
      } else {
        // ✅ AJOUT: Attendre avant de réessayer
        await new Promise(resolve => setTimeout(resolve, 500));
        throw error;
      }
    }
  }
  // ✅ Vérification finale avant return
  if (!db) {
    throw new Error('Database is null - cannot proceed');
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
  // ✅ CORRECTION: Attendre que db soit initialisé
  if (!db) {
    console.error('[Database] initDatabase appelé avec db=null');
    throw new Error('Database not initialized');
  }

  console.log('[Database] Initialisation des tables...');

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
  console.log('[Database] Table conversations OK');

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
  console.log('[Database] Table messages OK');

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

  // Table: user_profile (nom affiché personnalisable)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      displayName TEXT,
      statusMessage TEXT,
      avatarEmoji TEXT,
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
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

  // Table: cashu_tokens (wallet Cashu)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cashu_tokens (
      id TEXT PRIMARY KEY,
      mintUrl TEXT NOT NULL,
      amount INTEGER NOT NULL,
      token TEXT NOT NULL,
      proofs TEXT NOT NULL,
      keysetId TEXT,
      receivedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      spent INTEGER NOT NULL DEFAULT 0,
      spentAt INTEGER,
      source TEXT,
      memo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cashu_spent ON cashu_tokens(spent) WHERE spent = 0;
    CREATE INDEX IF NOT EXISTS idx_cashu_mint ON cashu_tokens(mintUrl);
  `);

  console.log('[Database] Tables initialisées');

  // ✅ NOUVEAU: Table mqtt_queue (file d'attente persistante)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS mqtt_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      qos INTEGER DEFAULT 1,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      next_retry_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_mqtt_queue_retry ON mqtt_queue(next_retry_at) WHERE retry_count < max_retries;
  `);
  console.log('[Database] Table mqtt_queue créée');

  // Table: submeshes
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS submeshes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL,
      icon TEXT,
      is_default INTEGER DEFAULT 0,
      auto_join INTEGER DEFAULT 0,
      require_invite INTEGER DEFAULT 1,
      max_hops INTEGER DEFAULT 5,
      parent_mesh TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);
  console.log('[Database] Table submeshes créée');

  // Table: submesh_peers
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS submesh_peers (
      node_id TEXT NOT NULL,
      submesh_id TEXT NOT NULL,
      rssi INTEGER DEFAULT -100,
      last_seen INTEGER DEFAULT 0,
      hops INTEGER DEFAULT 1,
      is_bridge INTEGER DEFAULT 0,
      PRIMARY KEY (node_id, submesh_id),
      FOREIGN KEY (submesh_id) REFERENCES submeshes(id) ON DELETE CASCADE
    );
  `);
  console.log('[Database] Table submesh_peers créée');

  // Insert submesh default
  await db.runAsync(
    `INSERT OR IGNORE INTO submeshes (id, name, color, is_default, auto_join, require_invite, max_hops)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['0x0000', 'Réseau Principal', '#22D3EE', 1, 1, 0, 10]
  );
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
  try {
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
  } catch (err) {
    console.error('[DB] Erreur listConversationsDB:', err);
    return []; // Retourner tableau vide en cas d'erreur
  }
}

export async function saveConversationDB(conv: DBConversation): Promise<void> {
  console.log('[DB] saveConversationDB appelé avec:', conv);
  
  // ✅ VÉRIFICATION: La base est-elle initialisée ?
  if (!db) {
    console.log('[DB] Base non initialisée, tentative d\'initialisation...');
    await getDatabase();
  }
  
  const database = await getDatabase();
  
  // ✅ VÉRIFICATION: La base est-elle bien ouverte ?
  if (!database) {
    throw new Error('Database is null after getDatabase()');
  }
  
  try {
    // ✅ CONVERSION explicite des types pour SQLite
    const params = [
      String(conv.id),
      String(conv.name),
      conv.isForum ? 1 : 0,
      conv.peerPubkey ? String(conv.peerPubkey) : null,
      conv.lastMessage ? String(conv.lastMessage) : '',
      Math.floor(Number(conv.lastMessageTime || Date.now())),
      Math.floor(Number(conv.unreadCount || 0)),
      conv.online ? 1 : 0,
    ];
    
    console.log('[DB] Params pour SQLite:', params);
    console.log('[DB] Exécution SQL...');
    
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
    `, params);
    console.log('[DB] Conversation sauvegardée avec succès');
  } catch (err) {
    console.error('[DB] Erreur saveConversationDB:', err);
    throw err;
  }
}

export async function updateConversationLastMessageDB(
  convId: string,
  lastMessage: string,
  ts: number,
  incrementUnread: boolean
): Promise<void> {
  try {
    const database = await getDatabase();
    // ✅ CONVERSION explicite
    const params = [String(lastMessage), Math.floor(Number(ts)), String(convId)];
    
    if (incrementUnread) {
      await database.runAsync(`
        UPDATE conversations 
        SET lastMessage = ?, lastMessageTime = ?, unreadCount = unreadCount + 1, updatedAt = strftime('%s', 'now') * 1000
        WHERE id = ?
      `, params);
    } else {
      await database.runAsync(`
        UPDATE conversations 
        SET lastMessage = ?, lastMessageTime = ?, updatedAt = strftime('%s', 'now') * 1000
        WHERE id = ?
      `, params);
    }
    console.log('[DB] Conversation mise à jour:', convId);
  } catch (err) {
    console.error('[DB] Erreur updateConversationLastMessageDB:', err);
    throw err;
  }
}

export async function markConversationReadDB(convId: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE conversations SET unreadCount = 0, updatedAt = strftime('%s', 'now') * 1000 WHERE id = ?
    `, toSQLiteParams([convId]));
    console.log('[DB] Conversation marquée comme lue:', convId);
  } catch (err) {
    console.error('[DB] Erreur markConversationReadDB:', err);
    throw err;
  }
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
  try {
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
  } catch (err) {
    console.error('[DB] Erreur loadMessagesDB:', err);
    return []; // Retourner tableau vide en cas d'erreur
  }
}

export async function saveMessageDB(msg: DBMessage): Promise<void> {
  try {
    const database = await getDatabase();
    
    // ✅ CONVERSION explicite des types pour SQLite
    const params = [
      String(msg.id),
      String(msg.conversationId),
      String(msg.fromNodeId),
      msg.fromPubkey ? String(msg.fromPubkey) : null,
      String(msg.text),
      String(msg.type),
      Math.floor(Number(msg.timestamp || Date.now())),
      msg.isMine ? 1 : 0,
      String(msg.status),
      msg.cashuAmount ? Math.floor(Number(msg.cashuAmount)) : null,
      msg.cashuToken ? String(msg.cashuToken) : null,
      msg.btcAmount ? Math.floor(Number(msg.btcAmount)) : null,
      msg.compressed ? 1 : 0,
    ];
    
    await database.runAsync(`
      INSERT OR REPLACE INTO messages 
      (id, conversationId, fromNodeId, fromPubkey, text, type, timestamp, isMine, status, cashuAmount, cashuToken, btcAmount, compressed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, params);
    
    console.log('[DB] Message sauvegardé:', msg.id);
  } catch (err) {
    console.error('[DB] Erreur saveMessageDB:', err);
    throw err;
  }
}

export async function updateMessageStatusDB(
  msgId: string,
  status: DBMessage['status']
): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE messages SET status = ? WHERE id = ?
    `, [status, msgId]);
    console.log('[DB] Message status updated:', msgId, status);
  } catch (err) {
    console.error('[DB] Erreur updateMessageStatusDB:', err);
    throw err;
  }
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
  try {
    const database = await getDatabase();
    await database.runAsync(`
      INSERT INTO pending_messages (id, packet, retries, maxRetries, nextRetryAt)
      VALUES (?, ?, 0, ?, strftime('%s', 'now') * 1000)
      ON CONFLICT(id) DO UPDATE SET
        retries = retries + 1,
        nextRetryAt = strftime('%s', 'now') * 1000 + (1000 * (retries + 1) * (retries + 1))
    `, [id, uint8ArrayToBase64(packet), maxRetries]);
    console.log('[DB] Pending message queued:', id);
  } catch (err) {
    console.error('[DB] Erreur queuePendingMessage:', err);
    throw err;
  }
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const database = await getDatabase();
    const now = Date.now();
    const rows = await database.getAllAsync<any>(`
      SELECT * FROM pending_messages 
      WHERE retries < maxRetries AND nextRetryAt <= ?
      ORDER BY nextRetryAt ASC
    `, [now]);
    return rows.map(row => ({
      ...row,
      packet: base64ToUint8Array(row.packet),
    }));
  } catch (err) {
    console.error('[DB] Erreur getPendingMessages:', err);
    return [];
  }
}

export async function removePendingMessage(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM pending_messages WHERE id = ?`, toSQLiteParams([id]));
    console.log('[DB] Pending message removed:', id);
  } catch (err) {
    console.error('[DB] Erreur removePendingMessage:', err);
    throw err;
  }
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

// --- Auto-cleanup (messages > 24h) ---

const MESSAGE_RETENTION_HOURS = 24;

export async function cleanupOldMessages(): Promise<number> {
  try {
    const database = await getDatabase();
    const cutoffTime = Date.now() - (MESSAGE_RETENTION_HOURS * 60 * 60 * 1000);
    
    const result = await database.runAsync(`
      DELETE FROM messages WHERE timestamp < ?
    `, [cutoffTime]);
    
    const deletedCount = result.changes || 0;
    if (deletedCount > 0) {
      console.log(`[Database] ${deletedCount} messages effacés (> ${MESSAGE_RETENTION_HOURS}h)`);
    }
    return deletedCount;
  } catch (err) {
    console.error('[DB] Erreur cleanupOldMessages:', err);
    return 0;
  }
}

// --- Cashu Tokens (Wallet) ---

export interface DBCashuToken {
  id: string;
  mintUrl: string;
  amount: number;
  token: string;
  proofs: string;
  keysetId?: string;
  receivedAt: number;
  state: 'unspent' | 'pending' | 'spent' | 'unverified';  // ✅ NOUVEAU : état complet
  spentAt?: number;
  source?: string;
  memo?: string;
  unverified?: boolean;  // ✅ NOUVEAU : si reçu offline
  retryCount?: number;   // ✅ NOUVEAU : compteur de retry
  lastCheckAt?: number;  // ✅ NOUVEAU : dernière vérif
}

export async function saveCashuToken(token: Omit<DBCashuToken, 'receivedAt'>): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      INSERT OR REPLACE INTO cashu_tokens 
      (id, mintUrl, amount, token, proofs, keysetId, receivedAt, state, spentAt, source, memo, unverified, retryCount, lastCheckAt)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now') * 1000, ?, ?, ?, ?, ?, ?, ?)
    `, toSQLiteParams([
      token.id,
      token.mintUrl,
      token.amount,
      token.token,
      token.proofs,
      token.keysetId || null,
      token.state || 'unspent',
      token.spentAt || null,
      token.source || null,
      token.memo || null,
      token.unverified ? 1 : 0,
      token.retryCount || 0,
      token.lastCheckAt || null,
    ]));
    console.log('[DB] Cashu token sauvegardé:', token.id);
  } catch (err) {
    console.error('[DB] Erreur saveCashuToken:', err);
    throw err;
  }
}

export async function getUnspentCashuTokens(): Promise<DBCashuToken[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT * FROM cashu_tokens WHERE state IN ('unspent', 'unverified') ORDER BY receivedAt DESC
    `);
    return rows.map(row => ({
      ...row,
      state: row.state || (row.spent ? 'spent' : 'unspent'),
      unverified: Boolean(row.unverified),
    }));
  } catch (err) {
    console.error('[DB] Erreur getUnspentCashuTokens:', err);
    return []; // Retourner tableau vide en cas d'erreur
  }
}

export async function markCashuTokenSpent(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE cashu_tokens 
      SET state = 'spent', spentAt = strftime('%s', 'now') * 1000
      WHERE id = ?
    `, toSQLiteParams([id]));
    console.log('[DB] Cashu token marqué comme spent:', id);
  } catch (err) {
    console.error('[DB] Erreur markCashuTokenSpent:', err);
    throw err;
  }
}

// ✅ NOUVEAU : Marquer comme pending
export async function markCashuTokenPending(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE cashu_tokens 
      SET state = 'pending'
      WHERE id = ?
    `, toSQLiteParams([id]));
    console.log('[DB] Cashu token marqué comme pending:', id);
  } catch (err) {
    console.error('[DB] Erreur markCashuTokenPending:', err);
    throw err;
  }
}

// ✅ NOUVEAU : Remettre à unspent (rollback)
export async function markCashuTokenUnspent(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE cashu_tokens 
      SET state = 'unspent', pending = 0
      WHERE id = ?
    `, toSQLiteParams([id]));
    console.log('[DB] Cashu token remis à unspent:', id);
  } catch (err) {
    console.error('[DB] Erreur markCashuTokenUnspent:', err);
    throw err;
  }
}

// ✅ NOUVEAU : Mettre à jour après vérification
export async function markCashuTokenVerified(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE cashu_tokens 
      SET state = 'unspent', unverified = 0, lastCheckAt = strftime('%s', 'now') * 1000
      WHERE id = ?
    `, toSQLiteParams([id]));
    console.log('[DB] Cashu token vérifié:', id);
  } catch (err) {
    console.error('[DB] Erreur markCashuTokenVerified:', err);
    throw err;
  }
}

export async function getCashuTokenById(id: string): Promise<DBCashuToken | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<any>(`
      SELECT * FROM cashu_tokens WHERE id = ?
    `, [id]);
    if (!row) return null;
    return { ...row, spent: Boolean(row.spent) };
  } catch (err) {
    console.error('[DB] Erreur getCashuTokenById:', err);
    return null;
  }
}

export async function getCashuBalance(): Promise<{ total: number; byMint: Record<string, number> }> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ mintUrl: string; amount: number }>(`
      SELECT mintUrl, SUM(amount) as amount 
      FROM cashu_tokens 
      WHERE state IN ('unspent', 'unverified')
      GROUP BY mintUrl
    `);
    
    let total = 0;
    const byMint: Record<string, number> = {};
    
    for (const row of rows) {
      total += row.amount;
      byMint[row.mintUrl] = row.amount;
    }
    
    return { total, byMint };
  } catch (err) {
    console.error('[DB] Erreur getCashuBalance:', err);
    return { total: 0, byMint: {} };
  }
}

// ✅ NOUVEAU : Récupérer tous les mints utilisés
export async function getAllMints(): Promise<string[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ mintUrl: string }>(`
      SELECT DISTINCT mintUrl FROM cashu_tokens ORDER BY mintUrl
    `);
    return rows.map(r => r.mintUrl);
  } catch (err) {
    console.error('[DB] Erreur getAllMints:', err);
    return [];
  }
}

// ✅ NOUVEAU : Récupérer les tokens par mint
export async function getTokensByMint(mintUrl: string): Promise<DBCashuToken[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT * FROM cashu_tokens 
      WHERE mintUrl = ? AND state IN ('unspent', 'unverified')
      ORDER BY amount DESC
    `, [mintUrl]);
    return rows.map(row => ({
      ...row,
      state: row.state || 'unspent',
      unverified: Boolean(row.unverified),
    }));
  } catch (err) {
    console.error('[DB] Erreur getTokensByMint:', err);
    return [];
  }
}

// ✅ NOUVEAU : Export tous les tokens (backup)
export async function exportCashuTokens(): Promise<DBCashuToken[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT * FROM cashu_tokens ORDER BY receivedAt DESC
    `);
    return rows.map(row => ({
      ...row,
      state: row.state || 'unspent',
      unverified: Boolean(row.unverified),
    }));
  } catch (err) {
    console.error('[DB] Erreur exportCashuTokens:', err);
    return [];
  }
}

// ✅ NOUVEAU : Import tokens (restore)
export async function importCashuTokens(tokens: DBCashuToken[]): Promise<number> {
  const database = await getDatabase();
  let imported = 0;
  
  for (const token of tokens) {
    try {
      await database.runAsync(`
        INSERT OR IGNORE INTO cashu_tokens 
        (id, mintUrl, amount, token, proofs, keysetId, receivedAt, state, spentAt, source, memo, unverified, retryCount, lastCheckAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        token.id,
        token.mintUrl,
        token.amount,
        token.token,
        token.proofs,
        token.keysetId || null,
        token.receivedAt,
        token.state || 'unspent',
        token.spentAt || null,
        token.source || null,
        token.memo || null,
        token.unverified ? 1 : 0,
        token.retryCount || 0,
        token.lastCheckAt || null,
      ]);
      imported++;
    } catch (err) {
      console.log('[Database] Erreur import token:', token.id, err);
    }
  }
  
  return imported;
}

// ✅ NOUVEAU : Récupérer les tokens unverified pour retry
export async function getUnverifiedCashuTokens(): Promise<DBCashuToken[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(`
      SELECT * FROM cashu_tokens 
      WHERE state = 'unverified' 
      AND (retryCount < 5 OR retryCount IS NULL)
      ORDER BY receivedAt ASC
    `);
    return rows.map(row => ({
      ...row,
      state: row.state || 'unspent',
      unverified: Boolean(row.unverified),
    }));
  } catch (err) {
    console.error('[DB] Erreur getUnverifiedCashuTokens:', err);
    return [];
  }
}

// --- User Profile (display name personnalisable) ---

export interface UserProfile {
  displayName: string | null;
  statusMessage: string | null;
  avatarEmoji: string | null;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ displayName: string | null; statusMessage: string | null; avatarEmoji: string | null }>(`
      SELECT displayName, statusMessage, avatarEmoji FROM user_profile WHERE id = 1
    `);
    return row || null;
  } catch (err) {
    console.error('[DB] Erreur getUserProfile:', err);
    return null;
  }
}

export async function setUserProfile(profile: Partial<UserProfile>): Promise<void> {
  try {
    const database = await getDatabase();
    const existing = await getUserProfile();
    
    if (existing) {
      await database.runAsync(`
        UPDATE user_profile 
        SET displayName = COALESCE(?, displayName),
            statusMessage = COALESCE(?, statusMessage),
            avatarEmoji = COALESCE(?, avatarEmoji),
            updatedAt = strftime('%s', 'now') * 1000
        WHERE id = 1
      `, [profile.displayName ?? null, profile.statusMessage ?? null, profile.avatarEmoji ?? null]);
    } else {
      await database.runAsync(`
        INSERT INTO user_profile (id, displayName, statusMessage, avatarEmoji)
        VALUES (1, ?, ?, ?)
      `, [profile.displayName ?? null, profile.statusMessage ?? null, profile.avatarEmoji ?? null]);
    }
    console.log('[DB] User profile updated');
  } catch (err) {
    console.error('[DB] Erreur setUserProfile:', err);
    throw err;
  }
}

// --- Key Store ---

export async function savePubkey(nodeId: string, pubkeyHex: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      INSERT INTO key_store (nodeId, pubkeyHex, lastSeen)
      VALUES (?, ?, strftime('%s', 'now') * 1000)
      ON CONFLICT(nodeId) DO UPDATE SET
        pubkeyHex = excluded.pubkeyHex,
        lastSeen = excluded.lastSeen
    `, [nodeId, pubkeyHex]);
    console.log('[DB] Pubkey saved:', nodeId);
  } catch (err) {
    console.error('[DB] Erreur savePubkey:', err);
    throw err;
  }
}

export async function getPubkey(nodeId: string): Promise<string | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ pubkeyHex: string }>(`
      SELECT pubkeyHex FROM key_store WHERE nodeId = ?
    `, [nodeId]);
    return row?.pubkeyHex || null;
  } catch (err) {
    console.error('[DB] Erreur getPubkey:', err);
    return null;
  }
}

// --- Message Counter (pour IDs uniques) ---

export async function getNextMessageId(): Promise<number> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      UPDATE message_counters SET counter = counter + 1 WHERE id = 1
    `);
    const row = await database.getFirstAsync<{ counter: number }>(`
      SELECT counter FROM message_counters WHERE id = 1
    `);
    return row?.counter || 0;
  } catch (err) {
    console.error('[DB] Erreur getNextMessageId:', err);
    return Date.now(); // Fallback
  }
}

// --- App State ---

export async function setAppState(key: string, value: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`
      INSERT INTO app_state (key, value, updatedAt)
      VALUES (?, ?, strftime('%s', 'now') * 1000)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updatedAt = excluded.updatedAt
    `, [key, value]);
    console.log('[DB] App state set:', key);
  } catch (err) {
    console.error('[DB] Erreur setAppState:', err);
    throw err;
  }
}

export async function getAppState(key: string): Promise<string | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ value: string }>(`
      SELECT value FROM app_state WHERE key = ?
    `, [key]);
    return row?.value || null;
  } catch (err) {
    console.error('[DB] Erreur getAppState:', err);
    return null;
  }
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
        // ✅ CORRECTION: Utiliser toSQLiteParams pour conversion des types
        const params = toSQLiteParams([
          String(conv.id),
          String(conv.name),
          conv.isForum ? 1 : 0,
          conv.peerPubkey || null,
          conv.lastMessage || '',
          Math.floor(Number(conv.lastMessageTime || Date.now())),
          Math.floor(Number(conv.unreadCount || 0)),
          conv.online ? 1 : 0
        ]);
        
        await db.runAsync(
          `INSERT OR IGNORE INTO conversations 
           (id, name, isForum, peerPubkey, lastMessage, lastMessageTime, unreadCount, online)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          params
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
        // ✅ CORRECTION: Utiliser toSQLiteParams pour conversion des types
        const params = toSQLiteParams([
          String(msg.id),
          String(msg.conversationId),
          String(msg.from),
          msg.fromPubkey || null,
          String(msg.text),
          String(msg.type),
          Math.floor(Number(msg.timestamp)),
          msg.isMine ? 1 : 0,
          String(msg.status),
          msg.cashuAmount || null,
          msg.cashuToken || null
        ]);
        
        await db.runAsync(
          `INSERT OR IGNORE INTO messages 
           (id, conversationId, fromNodeId, fromPubkey, text, type, timestamp, isMine, status, cashuAmount, cashuToken)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params
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

// --- MQTT Queue (file d'attente persistante) ---

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

export async function enqueueMqttMessage(
  topic: string,
  payload: string,
  qos: number = 1,
  maxRetries: number = 3
): Promise<number> {
  try {
    const database = await getDatabase();
    const result = await database.runAsync(
      `INSERT INTO mqtt_queue (topic, payload, qos, max_retries, next_retry_at) VALUES (?, ?, ?, ?, ?)`,
      [topic, payload, qos, maxRetries, Date.now()]
    );
    console.log('[Database] MQTT message enqueued:', topic, 'id:', result.lastInsertRowId);
    return result.lastInsertRowId;
  } catch (err) {
    console.error('[DB] Erreur enqueueMqttMessage:', err);
    throw err;
  }
}

export async function getPendingMqttMessages(): Promise<DBMqttQueueItem[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(
      `SELECT * FROM mqtt_queue 
       WHERE retry_count < max_retries AND next_retry_at <= ? 
       ORDER BY created_at ASC`,
      [Date.now()]
    );
    return rows.map(row => ({
      id: row.id,
      topic: row.topic,
      payload: row.payload,
      qos: row.qos,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    createdAt: row.created_at,
    nextRetryAt: row.next_retry_at,
    }));
  } catch (err) {
    console.error('[DB] Erreur getPendingMqttMessages:', err);
    return [];
  }
}

export async function markMqttMessageSent(id: number): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM mqtt_queue WHERE id = ?`, toSQLiteParams([id]));
    console.log('[DB] MQTT message marked as sent:', id);
  } catch (err) {
    console.error('[DB] Erreur markMqttMessageSent:', err);
    throw err;
  }
}

export async function incrementMqttRetry(id: number): Promise<void> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{retry_count: number}>(
      `SELECT retry_count FROM mqtt_queue WHERE id = ?`, [id]
    );
    const retryCount = row?.retry_count || 0;
    const nextRetry = Date.now() + Math.pow(2, retryCount) * 1000;
    
    await database.runAsync(
      `UPDATE mqtt_queue SET retry_count = retry_count + 1, next_retry_at = ? WHERE id = ?`,
      [nextRetry, id]
    );
    console.log('[DB] MQTT retry incremented:', id);
  } catch (err) {
    console.error('[DB] Erreur incrementMqttRetry:', err);
    throw err;
  }
}

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

export async function saveSubMeshDB(submesh: DBSubMesh): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT OR REPLACE INTO submeshes 
       (id, name, description, color, icon, is_default, auto_join, require_invite, max_hops, parent_mesh, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submesh.id,
        submesh.name,
        submesh.description || null,
        submesh.color,
        submesh.icon || null,
        submesh.isDefault ? 1 : 0,
        submesh.autoJoin ? 1 : 0,
        submesh.requireInvite ? 1 : 0,
        submesh.maxHops,
        submesh.parentMesh || null,
        submesh.createdAt || Date.now(),
      ]
    );
    console.log('[DB] SubMesh saved:', submesh.id);
  } catch (err) {
    console.error('[DB] Erreur saveSubMeshDB:', err);
    throw err;
  }
}

export async function getSubMeshesDB(): Promise<DBSubMesh[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>('SELECT * FROM submeshes ORDER BY created_at DESC');
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon,
      isDefault: Boolean(row.is_default),
      autoJoin: Boolean(row.auto_join),
      requireInvite: Boolean(row.require_invite),
      maxHops: row.max_hops,
      parentMesh: row.parent_mesh,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error('[DB] Erreur getSubMeshesDB:', err);
    return [];
  }
}

export async function deleteSubMeshDB(id: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM submeshes WHERE id = ?', toSQLiteParams([id]));
    console.log('[DB] SubMesh deleted:', id);
  } catch (err) {
    console.error('[DB] Erreur deleteSubMeshDB:', err);
    throw err;
  }
}

export async function saveSubMeshPeerDB(peer: DBSubMeshPeer): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT OR REPLACE INTO submesh_peers 
       (node_id, submesh_id, rssi, last_seen, hops, is_bridge)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [peer.nodeId, peer.submeshId, peer.rssi, peer.lastSeen, peer.hops, peer.isBridge ? 1 : 0]
    );
    console.log('[DB] SubMesh peer saved:', peer.nodeId);
  } catch (err) {
    console.error('[DB] Erreur saveSubMeshPeerDB:', err);
    throw err;
  }
}

export async function getSubMeshPeersDB(submeshId: string): Promise<DBSubMeshPeer[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(
      'SELECT * FROM submesh_peers WHERE submesh_id = ? ORDER BY last_seen DESC',
      [submeshId]
    );
    return rows.map(row => ({
      nodeId: row.node_id,
      submeshId: row.submesh_id,
      rssi: row.rssi,
      lastSeen: row.last_seen,
      hops: row.hops,
      isBridge: Boolean(row.is_bridge),
    }));
  } catch (err) {
    console.error('[DB] Erreur getSubMeshPeersDB:', err);
    return [];
  }
}
