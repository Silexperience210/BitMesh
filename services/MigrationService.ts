/**
 * Migration Service - Migre les données d'AsyncStorage vers SQLite
 * À exécuter au premier démarrage après mise à jour
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDatabase,
  saveConversationDB,
  saveMessageDB,
  DBConversation,
  DBMessage,
} from '@/utils/database';

const MIGRATION_KEY = 'migration_v1_completed';

interface OldConversation {
  id: string;
  name: string;
  isForum: boolean;
  peerPubkey?: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  online: boolean;
}

interface OldMessage {
  id: string;
  conversationId: string;
  from: string;
  fromPubkey: string;
  text: string;
  type: 'text' | 'cashu' | 'btc_tx' | 'lora';
  timestamp: number;
  isMine: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  cashuAmount?: number;
  cashuToken?: string;
  btcAmount?: number;
}

/**
 * Vérifie si la migration est nécessaire
 */
export async function isMigrationNeeded(): Promise<boolean> {
  const completed = await AsyncStorage.getItem(MIGRATION_KEY);
  return completed !== 'true';
}

/**
 * Exécute la migration AsyncStorage → SQLite
 */
export async function runMigration(): Promise<{ success: boolean; migrated: number }> {
  console.log('[Migration] Démarrage migration AsyncStorage → SQLite...');

  try {
    // Migrer les conversations
    const convsRaw = await AsyncStorage.getItem('meshcore_conversations');
    const conversations: OldConversation[] = convsRaw ? JSON.parse(convsRaw) : [];

    for (const conv of conversations) {
      const newConv: DBConversation = {
        id: conv.id,
        name: conv.name,
        isForum: conv.isForum,
        peerPubkey: conv.peerPubkey,
        lastMessage: conv.lastMessage,
        lastMessageTime: conv.lastMessageTime,
        unreadCount: conv.unreadCount,
        online: conv.online,
      };
      await saveConversationDB(newConv);
    }

    console.log(`[Migration] ${conversations.length} conversations migrées`);

    // Migrer les messages (toutes les conversations)
    let totalMessages = 0;
    const MSG_PREFIX = 'meshcore_msgs_';
    const keys = await AsyncStorage.getAllKeys();
    const msgKeys = keys.filter(k => k.startsWith(MSG_PREFIX));

    for (const key of msgKeys) {
      const msgsRaw = await AsyncStorage.getItem(key);
      if (!msgsRaw) continue;

      const messages: OldMessage[] = JSON.parse(msgsRaw);
      for (const msg of messages) {
        const newMsg: DBMessage = {
          id: msg.id,
          conversationId: msg.conversationId,
          fromNodeId: msg.from,
          fromPubkey: msg.fromPubkey,
          text: msg.text,
          type: msg.type,
          timestamp: msg.timestamp,
          isMine: msg.isMine,
          status: msg.status,
          cashuAmount: msg.cashuAmount,
          cashuToken: msg.cashuToken,
          btcAmount: msg.btcAmount,
          compressed: false,
        };
        await saveMessageDB(newMsg);
        totalMessages++;
      }
    }

    console.log(`[Migration] ${totalMessages} messages migrés`);

    // Marquer la migration comme complétée
    await AsyncStorage.setItem(MIGRATION_KEY, 'true');

    // Optionnel: supprimer les anciennes données d'AsyncStorage
    // await AsyncStorage.multiRemove(keys.filter(k => k.startsWith('meshcore_')));

    return { success: true, migrated: conversations.length + totalMessages };
  } catch (error) {
    console.error('[Migration] Erreur:', error);
    return { success: false, migrated: 0 };
  }
}

/**
 * Réinitialise la migration (pour tests)
 */
export async function resetMigration(): Promise<void> {
  await AsyncStorage.removeItem(MIGRATION_KEY);
  console.log('[Migration] Réinitialisée');
}
