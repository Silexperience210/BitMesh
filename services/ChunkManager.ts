/**
 * ChunkManager - Gère l'envoi et la réception de messages chunkés
 * Pour messages longs qui dépassent la limite LoRa (200 bytes)
 */
import {
  MeshCorePacket,
  MeshCoreMessageType,
  chunkMessage,
  createChunkPacket,
  reassembleChunks,
  isChunkPacket,
  extractChunkInfo,
  validateMessageSize,
  LORA_MAX_TEXT_CHARS,
} from '@/utils/meshcore-protocol';
import { getNextMessageId } from '@/utils/database';

interface PendingChunks {
  messageId: number;
  totalChunks: number;
  chunks: Map<number, Uint8Array>;
  receivedAt: number;
}

class ChunkManager {
  private pendingReassembly = new Map<number, PendingChunks>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CHUNK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Nettoyage périodique des chunks expirés
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Vérifie si un message nécessite du chunking
   */
  needsChunking(text: string): boolean {
    const validation = validateMessageSize(text);
    return !validation.valid;
  }

  /**
   * Envoie un message avec chunking automatique si nécessaire
   * Retourne le nombre de chunks envoyés (0 si erreur)
   */
  async sendMessageWithChunking(
    text: string,
    fromNodeId: string,
    toNodeId: string,
    sendFunction: (packet: MeshCorePacket) => Promise<void>,
    encrypted: boolean = false
  ): Promise<{ success: boolean; chunksSent: number; error?: string }> {
    // Vérifier si chunking nécessaire
    if (!this.needsChunking(text)) {
      // Message court: envoi normal
      try {
        const { createTextMessageSync } = await import('@/utils/meshcore-protocol');
        const packet = createTextMessageSync(fromNodeId, toNodeId, text, encrypted);
        await sendFunction(packet);
        return { success: true, chunksSent: 1 };
      } catch (error) {
        return { success: false, chunksSent: 0, error: String(error) };
      }
    }

    // Message long: chunking
    const messageId = await getNextMessageId();
    const chunks = chunkMessage(text, messageId);
    
    if (!chunks || chunks.length === 0) {
      return { success: false, chunksSent: 0, error: 'Erreur chunking' };
    }

    console.log(`[ChunkManager] Envoi de ${chunks.length} chunks pour message ${messageId}`);

    // Envoyer chaque chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const packet = createChunkPacket(fromNodeId, toNodeId, chunk, encrypted);
      
      try {
        await sendFunction(packet);
        console.log(`[ChunkManager] Chunk ${i + 1}/${chunks.length} envoyé`);
      } catch (error) {
        console.error(`[ChunkManager] Erreur envoi chunk ${i}:`, error);
        return { 
          success: false, 
          chunksSent: i, 
          error: `Échec chunk ${i}: ${error}` 
        };
      }
      
      // Petit délai entre chunks pour ne pas saturer LoRa
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { success: true, chunksSent: chunks.length };
  }

  /**
   * Traite un chunk reçu
   * Retourne le message complet si tous les chunks sont reçus
   */
  handleIncomingChunk(packet: MeshCorePacket): { complete: boolean; message?: string; progress?: number; error?: string } {
    if (!isChunkPacket(packet)) {
      return { complete: false };
    }

    const info = extractChunkInfo(packet.payload);
    if (!info) {
      console.error('[ChunkManager] Chunk invalide');
      return { complete: false };
    }

    const { messageId, chunkIndex, totalChunks, data } = info;

    // Récupérer ou créer le pending
    let pending = this.pendingReassembly.get(messageId);
    if (!pending) {
      pending = {
        messageId,
        totalChunks,
        chunks: new Map(),
        receivedAt: Date.now(),
      };
      this.pendingReassembly.set(messageId, pending);
    }

    // Ajouter le chunk
    pending.chunks.set(chunkIndex, packet.payload);
    
    const progress = Math.round((pending.chunks.size / totalChunks) * 100);
    console.log(`[ChunkManager] Chunk ${chunkIndex + 1}/${totalChunks} reçu (${progress}%)`);

    // Vérifier si complet
    if (pending.chunks.size === totalChunks) {
      const message = reassembleChunks(pending.chunks, totalChunks);
      this.pendingReassembly.delete(messageId);
      
      if (message) {
        console.log(`[ChunkManager] Message ${messageId} reconstitué (${message.length} caractères)`);
        return { complete: true, message, progress: 100 };
      } else {
        return { complete: false, progress, error: 'Reconstitution échouée' };
      }
    }

    return { complete: false, progress };
  }

  /**
   * Nettoie les chunks expirés
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [messageId, pending] of this.pendingReassembly) {
      if (now - pending.receivedAt > this.CHUNK_TIMEOUT) {
        this.pendingReassembly.delete(messageId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[ChunkManager] ${cleaned} messages chunkés expirés nettoyés`);
    }
  }

  /**
   * Retourne le nombre de messages en cours de reconstitution
   */
  getPendingCount(): number {
    return this.pendingReassembly.size;
  }

  /**
   * Détruit le manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.pendingReassembly.clear();
  }
}

// Singleton
let chunkManager: ChunkManager | null = null;

export function getChunkManager(): ChunkManager {
  if (!chunkManager) {
    chunkManager = new ChunkManager();
  }
  return chunkManager;
}

export function initChunkManager(): ChunkManager {
  chunkManager = new ChunkManager();
  return chunkManager;
}

export { LORA_MAX_TEXT_CHARS, validateMessageSize };
