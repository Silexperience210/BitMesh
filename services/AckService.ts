/**
 * Ack Service - Gestion des accusés de réception
 * Ajoute des ACK pour confirmer la livraison des messages
 */
import { MeshCorePacket, MeshCoreMessageType, createTextMessage, nodeIdToUint64, uint64ToNodeId } from '@/utils/meshcore-protocol';
import { getBleGatewayClient } from '@/utils/ble-gateway';
import { updateMessageStatusDB } from '@/utils/database';

interface PendingAck {
  msgId: string;
  conversationId: string;
  timestamp: number;
  timeout: NodeJS.Timeout;
}

class AckService {
  private pendingAcks = new Map<string, PendingAck>();
  private onAckReceived?: (msgId: string) => void;
  private onAckTimeout?: (msgId: string) => void;

  constructor(
    onAckReceived?: (msgId: string) => void,
    onAckTimeout?: (msgId: string) => void
  ) {
    this.onAckReceived = onAckReceived;
    this.onAckTimeout = onAckTimeout;
  }

  /**
   * Envoie un message et attend l'ACK
   */
  async sendWithAck(
    packet: MeshCorePacket,
    originalMsgId: string,
    conversationId: string,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const client = getBleGatewayClient();
    
    return new Promise((resolve) => {
      // Envoyer le message
      client.sendPacket(packet).catch(() => {
        resolve(false);
      });

      // Mettre en attente d'ACK
      const timeout = setTimeout(async () => {
        this.pendingAcks.delete(originalMsgId);
        await updateMessageStatusDB(originalMsgId, 'failed');
        this.onAckTimeout?.(originalMsgId);
        resolve(false);
      }, timeoutMs);

      this.pendingAcks.set(originalMsgId, {
        msgId: originalMsgId,
        conversationId,
        timestamp: Date.now(),
        timeout,
      });

      // Mettre à jour le statut
      updateMessageStatusDB(originalMsgId, 'sending');
    });
  }

  /**
   * Traite un ACK reçu
   */
  async handleIncomingAck(packet: MeshCorePacket): Promise<void> {
    const ackMsgId = packet.payload[0]?.toString(); // Simplifié
    
    if (!ackMsgId) return;

    const pending = this.pendingAcks.get(ackMsgId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(ackMsgId);
      
      await updateMessageStatusDB(ackMsgId, 'delivered');
      this.onAckReceived?.(ackMsgId);
      
      console.log('[AckService] ACK reçu pour:', ackMsgId);
    }
  }

  /**
   * Crée un paquet ACK
   */
  createAckPacket(originalMsgId: string, toNodeId: string): MeshCorePacket {
    const client = getBleGatewayClient();
    const myNodeId = client.getNodeId?.() || 'MESH-0000';
    
    const encoder = new TextEncoder();
    const payload = encoder.encode(originalMsgId);
    
    return {
      version: 0x01,
      type: MeshCoreMessageType.ACK,
      flags: 0,
      ttl: 3,
      messageId: Date.now(),
      fromNodeId: nodeIdToUint64(myNodeId),
      toNodeId: nodeIdToUint64(toNodeId),
      timestamp: Math.floor(Date.now() / 1000),
      payload,
    };
  }

  /**
   * Annule l'attente d'ACK
   */
  cancelAck(msgId: string): void {
    const pending = this.pendingAcks.get(msgId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(msgId);
    }
  }

  /**
   * Retourne le nombre d'ACKs en attente
   */
  getPendingCount(): number {
    return this.pendingAcks.size;
  }

  /**
   * Nettoie les ACKs expirés
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [msgId, pending] of this.pendingAcks) {
      if (now - pending.timestamp > maxAge) {
        clearTimeout(pending.timeout);
        this.pendingAcks.delete(msgId);
        updateMessageStatusDB(msgId, 'failed');
      }
    }
  }
}

// Singleton
let ackService: AckService | null = null;

export function getAckService(
  onAckReceived?: (msgId: string) => void,
  onAckTimeout?: (msgId: string) => void
): AckService {
  if (!ackService) {
    ackService = new AckService(onAckReceived, onAckTimeout);
  }
  return ackService;
}

export function initAckService(
  onAckReceived?: (msgId: string) => void,
  onAckTimeout?: (msgId: string) => void
): AckService {
  ackService = new AckService(onAckReceived, onAckTimeout);
  return ackService;
}
