/**
 * Sub-meshes Support pour MeshCore
 * 
 * Gestion de multiples sous-réseaux mesh interconnectés
 * Permet de segmenter le réseau tout en maintenant la connectivité
 * 
 * NUT-XX: Proposition pour MeshCore v2
 */

import { type MeshCorePacket, MeshCoreMessageType, MeshCoreFlags, nodeIdToUint64 } from './meshcore-protocol';

// Identifiants de sub-mesh (16 bits = 65536 réseaux possibles)
export type SubMeshId = string; // Format: "0xABCD"

export interface SubMeshConfig {
  id: SubMeshId;
  name: string;
  description?: string;
  color: string; // Couleur pour UI
  icon?: string; // Emoji ou icône
  isDefault: boolean;
  autoJoin: boolean;
  requireInvite: boolean;
  maxHops: number; // Hops limités dans ce sub-mesh
  parentMesh?: SubMeshId; // Sub-mesh parent (hiérarchie)
}

export interface SubMeshPeer {
  nodeId: string;
  subMeshId: SubMeshId;
  rssi: number;
  lastSeen: number;
  hops: number;
  isBridge: boolean; // Relie plusieurs sub-meshes
}

export interface SubMeshStats {
  totalPeers: number;
  onlinePeers: number;
  messagesSent: number;
  messagesReceived: number;
  averageHops: number;
}

// Sub-mesh par défaut (réseau principal)
export const DEFAULT_SUBMESH: SubMeshId = '0x0000';

// Registry des sub-meshes connus
class SubMeshRegistry {
  private subMeshes: Map<SubMeshId, SubMeshConfig> = new Map();
  private peers: Map<SubMeshId, SubMeshPeer[]> = new Map();
  private currentSubMesh: SubMeshId = DEFAULT_SUBMESH;

  constructor() {
    // Initialiser le sub-mesh par défaut
    this.subMeshes.set(DEFAULT_SUBMESH, {
      id: DEFAULT_SUBMESH,
      name: 'Réseau Principal',
      color: '#22D3EE',
      isDefault: true,
      autoJoin: true,
      requireInvite: false,
      maxHops: 10,
    });
  }

  /**
   * Rejoint un sub-mesh
   */
  joinSubMesh(config: SubMeshConfig): boolean {
    if (this.subMeshes.has(config.id)) {
      console.log('[SubMesh] Already joined:', config.id);
      return false;
    }

    this.subMeshes.set(config.id, config);
    this.peers.set(config.id, []);
    
    console.log('[SubMesh] Joined:', config.id, config.name);
    return true;
  }

  /**
   * Quitte un sub-mesh
   */
  leaveSubMesh(subMeshId: SubMeshId): boolean {
    if (subMeshId === DEFAULT_SUBMESH) {
      console.log('[SubMesh] Cannot leave default sub-mesh');
      return false;
    }

    this.subMeshes.delete(subMeshId);
    this.peers.delete(subMeshId);
    
    if (this.currentSubMesh === subMeshId) {
      this.currentSubMesh = DEFAULT_SUBMESH;
    }
    
    console.log('[SubMesh] Left:', subMeshId);
    return true;
  }

  /**
   * Change le sub-mesh actif
   */
  switchSubMesh(subMeshId: SubMeshId): boolean {
    if (!this.subMeshes.has(subMeshId)) {
      console.log('[SubMesh] Unknown sub-mesh:', subMeshId);
      return false;
    }

    this.currentSubMesh = subMeshId;
    console.log('[SubMesh] Switched to:', subMeshId);
    return true;
  }

  /**
   * Récupère le sub-mesh actif
   */
  getCurrentSubMesh(): SubMeshConfig {
    return this.subMeshes.get(this.currentSubMesh)!;
  }

  /**
   * Liste tous les sub-meshes
   */
  getAllSubMeshes(): SubMeshConfig[] {
    return Array.from(this.subMeshes.values());
  }

  /**
   * Ajoute un peer à un sub-mesh
   */
  addPeer(subMeshId: SubMeshId, peer: SubMeshPeer) {
    const peers = this.peers.get(subMeshId) || [];
    const existing = peers.find(p => p.nodeId === peer.nodeId);
    
    if (existing) {
      // Mettre à jour
      Object.assign(existing, peer);
    } else {
      peers.push(peer);
    }
    
    this.peers.set(subMeshId, peers);
  }

  /**
   * Récupère les peers d'un sub-mesh
   */
  getPeers(subMeshId: SubMeshId): SubMeshPeer[] {
    return this.peers.get(subMeshId) || [];
  }

  /**
   * Récupère les stats d'un sub-mesh
   */
  getStats(subMeshId: SubMeshId): SubMeshStats {
    const peers = this.getPeers(subMeshId);
    const online = peers.filter(p => Date.now() - p.lastSeen < 300000); // 5 min
    
    return {
      totalPeers: peers.length,
      onlinePeers: online.length,
      messagesSent: 0, // TODO: tracker
      messagesReceived: 0,
      averageHops: peers.reduce((sum, p) => sum + p.hops, 0) / (peers.length || 1),
    };
  }

  /**
   * Encode le sub-mesh ID dans un paquet
   */
  encodeSubMeshId(subMeshId: SubMeshId): Uint8Array {
    const id = parseInt(subMeshId, 16);
    const bytes = new Uint8Array(2);
    bytes[0] = (id >> 8) & 0xFF;
    bytes[1] = id & 0xFF;
    return bytes;
  }

  /**
   * Décode le sub-mesh ID depuis un paquet
   */
  decodeSubMeshId(bytes: Uint8Array): SubMeshId {
    const id = (bytes[0] << 8) | bytes[1];
    return '0x' + id.toString(16).toUpperCase().padStart(4, '0');
  }
}

// Instance singleton
export const subMeshRegistry = new SubMeshRegistry();

/**
 * Crée un nouveau sub-mesh
 */
export function createSubMesh(
  name: string,
  options: Partial<Omit<SubMeshConfig, 'id' | 'name'>> = {}
): SubMeshConfig {
  // Générer un ID unique (aléatoire pour l'instant, devrait être déterministe)
  const id = '0x' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0') as SubMeshId;
  
  const config: SubMeshConfig = {
    id,
    name,
    color: options.color || '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
    isDefault: false,
    autoJoin: options.autoJoin ?? false,
    requireInvite: options.requireInvite ?? true,
    maxHops: options.maxHops ?? 5,
    parentMesh: options.parentMesh,
    ...options,
  };
  
  subMeshRegistry.joinSubMesh(config);
  return config;
}

/**
 * Envoie un message dans un sub-mesh spécifique
 */
export function sendToSubMesh(
  subMeshId: SubMeshId,
  message: string,
  fromNodeId: string,
  options: {
    encrypt?: boolean;
    priority?: 'low' | 'normal' | 'high';
  } = {}
): MeshCorePacket {
  const subMesh = subMeshRegistry.getAllSubMeshes().find(s => s.id === subMeshId);
  
  let flags = 0;
  if (options.encrypt) flags |= 0x01;
  flags |= MeshCoreFlags.SUBMESH; // ✅ Flag sub-mesh activé
  
  const packet: MeshCorePacket = {
    version: 0x01,
    type: MeshCoreMessageType.TEXT,
    flags,
    ttl: subMesh?.maxHops || 5,
    fromNodeId: nodeIdToUint64(fromNodeId),
    toNodeId: 0n, // Broadcast dans le sub-mesh
    messageId: Date.now(),
    timestamp: Math.floor(Date.now() / 1000),
    subMeshId: parseInt(subMeshId, 16) || 0,
    payload: new TextEncoder().encode(message),
  };
  
  console.log('[SubMesh] Packet created:', subMeshId, 'hops:', packet.ttl);
  return packet;
}

/**
 * Rejoint un sub-mesh via invitation
 */
export function joinSubMeshByInvite(inviteCode: string): SubMeshConfig | null {
  try {
    // Décoder le code d'invitation (base64 contenant l'ID et la clé)
    const decoded = atob(inviteCode);
    const data = JSON.parse(decoded);
    
    const config: SubMeshConfig = {
      id: data.id,
      name: data.name,
      color: data.color,
      isDefault: false,
      autoJoin: false,
      requireInvite: true,
      maxHops: data.maxHops || 5,
    };
    
    subMeshRegistry.joinSubMesh(config);
    return config;
  } catch (err) {
    console.error('[SubMesh] Invalid invite code:', err);
    return null;
  }
}

/**
 * Génère un code d'invitation pour un sub-mesh
 */
export function generateInviteCode(subMeshId: SubMeshId): string | null {
  const config = subMeshRegistry.getAllSubMeshes().find(s => s.id === subMeshId);
  if (!config) return null;
  
  const inviteData = {
    id: config.id,
    name: config.name,
    color: config.color,
    maxHops: config.maxHops,
  };
  
  return btoa(JSON.stringify(inviteData));
}

/**
 * Trouve les bridges entre sub-meshes
 */
export function findBridges(): SubMeshPeer[] {
  const bridges: SubMeshPeer[] = [];
  
  for (const [subMeshId, peers] of subMeshRegistry['peers']) {
    for (const peer of peers) {
      if (peer.isBridge) {
        bridges.push(peer);
      }
    }
  }
  
  return bridges;
}
