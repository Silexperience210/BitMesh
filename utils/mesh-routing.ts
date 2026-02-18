/**
 * MeshCore Multi-Hop Routing
 *
 * Implémente le routage mesh avec flood routing + TTL + deduplication
 * conforme à la spec MeshCore Protocol v1.0
 */

export interface MeshRoute {
  nodeId: string;
  lastSeen: number;
  rssi?: number;      // Signal strength (LoRa) ou latency (MQTT)
  hopCount: number;   // Distance en hops (1 = direct neighbor)
  via?: string[];     // Chemin pour atteindre ce nœud
}

export interface MeshMessage {
  v: number;
  msgId: string;
  from: string;
  to: string;
  fromPubkey?: string;
  enc: {
    nonce: string;
    ct: string;
  };
  ts: number;
  type: 'text' | 'cashu' | 'btc_tx';
  ttl: number;
  hopCount: number;
  route: string[];
}

interface SeenMessage {
  msgId: string;
  timestamp: number;
}

const DEFAULT_TTL = 10;
const MAX_TTL = 10;
const SEEN_MESSAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Classe de gestion du routage mesh
 */
export class MeshRouter {
  private myNodeId: string;
  private neighbors: Map<string, MeshRoute>;
  private seenMessages: Map<string, number>; // msgId → timestamp
  private cleanupTimer?: NodeJS.Timeout;

  constructor(myNodeId: string) {
    this.myNodeId = myNodeId;
    this.neighbors = new Map();
    this.seenMessages = new Map();
    this.startCleanup();
  }

  /**
   * Nettoie périodiquement les messages vus expirés
   */
  private startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];

      this.seenMessages.forEach((timestamp, msgId) => {
        if (now - timestamp > SEEN_MESSAGE_TTL_MS) {
          expired.push(msgId);
        }
      });

      expired.forEach(msgId => this.seenMessages.delete(msgId));

      if (expired.length > 0) {
        console.log(`[MeshRouter] Cleaned ${expired.length} expired message IDs`);
      }
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Arrête le cleanup timer
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Ajoute ou met à jour un voisin dans la routing table
   */
  updateNeighbor(nodeId: string, rssi?: number, hopCount: number = 1) {
    this.neighbors.set(nodeId, {
      nodeId,
      lastSeen: Date.now(),
      rssi,
      hopCount,
    });
  }

  /**
   * Supprime un voisin de la routing table
   */
  removeNeighbor(nodeId: string) {
    this.neighbors.delete(nodeId);
  }

  /**
   * Retourne la liste des voisins actifs
   */
  getNeighbors(): MeshRoute[] {
    const now = Date.now();
    const active: MeshRoute[] = [];

    this.neighbors.forEach((route) => {
      // Considère offline si pas vu depuis 5 min
      if (now - route.lastSeen < 5 * 60 * 1000) {
        active.push(route);
      }
    });

    return active;
  }

  /**
   * Vérifie si un message a déjà été vu (deduplication)
   */
  hasSeen(msgId: string): boolean {
    return this.seenMessages.has(msgId);
  }

  /**
   * Marque un message comme vu
   */
  markSeen(msgId: string) {
    this.seenMessages.set(msgId, Date.now());
  }

  /**
   * Crée un nouveau message pour envoi initial
   */
  createMessage(
    to: string,
    encryptedPayload: { nonce: string; ct: string },
    fromPubkey: string,
    type: 'text' | 'cashu' | 'btc_tx' = 'text'
  ): MeshMessage {
    return {
      v: 1,
      msgId: this.generateMsgId(),
      from: this.myNodeId,
      to,
      fromPubkey,
      enc: encryptedPayload,
      ts: Date.now(),
      type,
      ttl: DEFAULT_TTL,
      hopCount: 0,
      route: [this.myNodeId],
    };
  }

  /**
   * Traite un message reçu et détermine l'action
   *
   * @returns
   * - 'deliver': Message pour nous → déchiffrer et afficher
   * - 'relay': Message pour quelqu'un d'autre → rebroadcast
   * - 'drop': Message dupliqué/expiré → ignorer
   */
  processIncomingMessage(message: MeshMessage): 'deliver' | 'relay' | 'drop' {
    // 1. Deduplication
    if (this.hasSeen(message.msgId)) {
      console.log(`[MeshRouter] DROP: Message ${message.msgId} already seen`);
      return 'drop';
    }

    // 2. Marquer comme vu
    this.markSeen(message.msgId);

    // 3. Vérifier TTL
    if (message.ttl <= 0) {
      console.log(`[MeshRouter] DROP: Message ${message.msgId} TTL exhausted`);
      return 'drop';
    }

    // 4. Vérifier si le message est pour nous
    if (message.to === this.myNodeId || message.to === 'broadcast') {
      console.log(`[MeshRouter] DELIVER: Message ${message.msgId} is for us`);
      return 'deliver';
    }

    // 5. Message pour quelqu'un d'autre → relay
    console.log(`[MeshRouter] RELAY: Message ${message.msgId} from ${message.from} to ${message.to} (TTL=${message.ttl}, hops=${message.hopCount})`);
    return 'relay';
  }

  /**
   * Prépare un message pour relay (décrémente TTL, incrémente hopCount)
   */
  prepareRelay(message: MeshMessage): MeshMessage {
    return {
      ...message,
      ttl: message.ttl - 1,
      hopCount: message.hopCount + 1,
      route: [...message.route, this.myNodeId],
    };
  }

  /**
   * Génère un ID unique pour message
   */
  private generateMsgId(): string {
    // UUID v4 simple (sans dépendance externe)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Vérifie si un nœud est un voisin direct
   */
  isDirectNeighbor(nodeId: string): boolean {
    const neighbor = this.neighbors.get(nodeId);
    return neighbor !== undefined && neighbor.hopCount === 1;
  }

  /**
   * Trouve le meilleur chemin vers un nœud (basé sur hopCount)
   */
  findRoute(nodeId: string): string[] | null {
    const neighbor = this.neighbors.get(nodeId);
    if (!neighbor) return null;

    // Si voisin direct, retourne chemin direct
    if (neighbor.hopCount === 1) {
      return [this.myNodeId, nodeId];
    }

    // Sinon retourne le chemin via (si disponible)
    if (neighbor.via && neighbor.via.length > 0) {
      return [...neighbor.via, nodeId];
    }

    return null;
  }

  /**
   * Statistiques du routeur
   */
  getStats() {
    return {
      myNodeId: this.myNodeId,
      neighbors: this.neighbors.size,
      seenMessages: this.seenMessages.size,
      activeNeighbors: this.getNeighbors().length,
    };
  }

  /**
   * Exporte la routing table (pour debug)
   */
  exportRoutingTable(): Record<string, MeshRoute> {
    const table: Record<string, MeshRoute> = {};
    this.neighbors.forEach((route, nodeId) => {
      table[nodeId] = route;
    });
    return table;
  }
}

/**
 * Fonction helper pour vérifier si un message est valide
 */
export function isValidMeshMessage(obj: any): obj is MeshMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.v === 'number' &&
    typeof obj.msgId === 'string' &&
    typeof obj.from === 'string' &&
    typeof obj.to === 'string' &&
    typeof obj.enc === 'object' &&
    typeof obj.enc.nonce === 'string' &&
    typeof obj.enc.ct === 'string' &&
    typeof obj.ts === 'number' &&
    typeof obj.type === 'string' &&
    typeof obj.ttl === 'number' &&
    typeof obj.hopCount === 'number' &&
    Array.isArray(obj.route)
  );
}

/**
 * Force TTL à une valeur max (sécurité)
 */
export function sanitizeTTL(ttl: number): number {
  return Math.min(Math.max(0, ttl), MAX_TTL);
}
