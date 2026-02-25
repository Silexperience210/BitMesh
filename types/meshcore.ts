/**
 * MeshCore Protocol - Types et Constants Complets
 * Basé sur l'analyse du firmware v1.12.0 - v1.13.0
 * 
 * Ce fichier contient TOUTES les constantes, types et structures
 * nécessaires pour implémenter le protocole MeshCore Companion.
 */

// ============================================================================
// CONSTANTES PROTOCOLE COMPANION (BLE/USB)
// ============================================================================

/** Version du protocole Companion - DOIT ÊTRE 1 pour compatibilité */
export const PROTOCOL_VERSION = 1;

/** Service BLE Nordic UART */
export const BLE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const BLE_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';  // Write
export const BLE_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';  // Notify

/** Taille max d'écriture BLE (MTU 185 - 3 bytes overhead) */
export const BLE_MAX_WRITE = 182;

/**
 * Commandes App → Firmware (0x01 - 0x7F)
 * Toutes les commandes disponibles dans le protocole Companion
 */
export const CMD_CODES = {
  // Initialisation
  APP_START: 0x01,
  
  // Envoi messages
  SEND_TXT_MSG: 0x02,
  SEND_CHANNEL_TXT_MSG: 0x03,
  
  // Gestion contacts
  GET_CONTACTS: 0x04,
  GET_DEVICE_TIME: 0x05,
  SET_DEVICE_TIME: 0x06,
  SEND_SELF_ADVERT: 0x07,
  ADD_UPDATE_CONTACT: 0x09,
  SYNC_NEXT_MESSAGE: 0x0A,
  RESET_PATH: 0x13,
  
  // Gestion canaux
  GET_CHANNEL: 0x1F,
  SET_CHANNEL: 0x20,
  
  // Requêtes spéciales
  SEND_LOGIN: 0x33,
  SEND_STATUS_REQ: 0x38,
  SEND_TELEMETRY_REQ: 0x39,
  SEND_TRACE: 0x3A,
  
  // Debug/Diagnostics
  GET_STATS: 0x40,
  RADIO_RX_TEST: 0x43,
  RADIO_TX_TEST: 0x44,
} as const;

/**
 * Réponses Firmware → App (0x00 - 0x7F)
 * Codes de réponse synchrone aux commandes
 */
export const RESP_CODES = {
  OK: 0x00,
  ERR: 0x01,
  CONTACTS_START: 0x02,
  CONTACT: 0x03,
  END_OF_CONTACTS: 0x04,
  DEVICE_TIME: 0x05,
  SEND_CONFIRMED: 0x06,        // Message accepté par firmware
  CONTACT_MSG_RECV: 0x07,      // v<3 (déprécié)
  NO_MORE_MESSAGES: 0x10,
  CHANNEL_INFO: 0x12,
  CONTACT_MSG_RECV_V3: 0x16,   // v3+ (format actuel)
  SELF_INFO: 0x17,
  STATS_RESPONSE: 0x18,
} as const;

/**
 * Push Codes asynchrones (0x80 - 0xFF)
 * Événements initiés par le firmware sans commande préalable
 */
export const PUSH_CODES = {
  ADVERT: 0x80,                // Nouveau nœud détecté
  PATH_UPDATED: 0x81,          // Path vers contact mis à jour
  SEND_CONFIRMED: 0x82,        // ACK LoRa reçu! ✅
  MSG_WAITING: 0x83,           // Messages en file offline
  RAW_DATA: 0x84,              // Données brutes reçues
  LOGIN_SUCCESS: 0x85,         // Login room server OK
  LOGIN_FAIL: 0x86,            // Login échoué
  STATUS_RESPONSE: 0x87,       // Réponse statut demandée
  TELEMETRY_RESPONSE: 0x88,    // Réponse télémétrie
  TRACE_DATA: 0x89,            // Données traceroute
  CONTACTS_FULL: 0x90,         // Table contacts pleine
} as const;

/**
 * Codes d'erreur détaillés
 */
export const ERR_CODES = {
  UNSUPPORTED_CMD: 1,
  NOT_FOUND: 2,
  TABLE_FULL: 3,
  BAD_STATE: 4,
  FILE_IO_ERROR: 5,
  ILLEGAL_ARG: 6,
} as const;

// ============================================================================
// CONSTANTES PROTOCOLE LORA (Radio Layer)
// ============================================================================

/**
 * Route Types (bits 0-1 du header LoRa)
 * Déterminent comment le paquet est routé dans le mesh
 */
export const ROUTE_TYPES = {
  TRANSPORT_FLOOD: 0x00,       // Flood + Transport Codes (filtres régionaux)
  FLOOD: 0x01,                 // Inondation standard (broadcast)
  DIRECT: 0x02,                // Routage direct avec path connu
  TRANSPORT_DIRECT: 0x03,      // Direct + Transport Codes
} as const;

/**
 * Payload Types (bits 2-5 du header LoRa)
 * Déterminent le contenu et le traitement du paquet
 */
export const PAYLOAD_TYPES = {
  REQ: 0x00,                   // Requête chiffrée
  RESPONSE: 0x01,              // Réponse chiffrée
  TXT_MSG: 0x02,               // Message texte (chiffré)
  ACK: 0x03,                   // Accusé réception
  ADVERT: 0x04,                // Annonce de nœud
  GRP_TXT: 0x05,               // Message groupe/chanel
  GRP_DATA: 0x06,              // Data groupe binaire
  ANON_REQ: 0x07,              // Requête anonyme
  PATH_RETURN: 0x08,           // Retour de chemin (découverte)
  TRACE: 0x09,                 // Traceroute/diagnostic
  MULTIPART: 0x0A,             // Message fragmenté
  CONTROL: 0x0B,               // Paquet de contrôle
  RAW_CUSTOM: 0x0F,            // Payload personnalisé
} as const;

/**
 * Types de contacts
 * Définissent le comportement et les capacités d'un nœud
 */
export const CONTACT_TYPES = {
  CHAT: 0,                     // Contact de chat standard
  REPEATER: 1,                 // Répéteur (relay uniquement)
  ROOM_SERVER: 2,              // Serveur de salon/BBS
  SENSOR: 3,                   // Nœud capteur
} as const;

/**
 * Flags ContactInfo (bits de configuration)
 */
export const CONTACT_FLAGS = {
  IS_FAVOURITE: 0x01,          // Contact favori (non écrasable)
  IS_LOST: 0x02,               // Contact perdu (path expiré)
} as const;

/**
 * Types de requêtes serveur (pour ROOM_SERVER/SENSOR)
 */
export const REQ_TYPES = {
  GET_STATUS: 0x01,
  KEEP_ALIVE: 0x02,            // Déprécié
  GET_TELEMETRY_DATA: 0x03,
  GET_MIN_MAX_AVG: 0x04,
  GET_ACCESS_LIST: 0x05,
  GET_NEIGHBORS: 0x06,
  GET_OWNER_INFO: 0x07,
} as const;

// ============================================================================
// LIMITES ET CONTRAINTES SYSTÈME
// ============================================================================

export const LIMITS = {
  // Tailles mémoire
  MAX_CONTACTS: 100,           // Nombre max de contacts stockés
  MAX_PATH_SIZE: 64,           // Nombre max de sauts dans un path
  MAX_PACKET_PAYLOAD: 184,     // Taille max payload LoRa
  MAX_TRANS_UNIT: 255,         // MTU radio
  OFFLINE_QUEUE_SIZE: 16,      // Messages en attente (app déconnectée)
  MAX_ADVERT_DATA_SIZE: 32,    // Données dans un advert
  
  // Contraintes messages
  MAX_MESSAGE_LENGTH: 150,     // ~150 caractères après overhead crypto
  MAX_NAME_LENGTH: 32,         // Nom contact
  
  // Cryptographie
  PUB_KEY_SIZE: 32,            // Ed25519 public key
  PRV_KEY_SIZE: 64,            // Ed25519 private key
  SIGNATURE_SIZE: 64,          // Signature Ed25519
  CIPHER_KEY_SIZE: 16,         // AES-128
  CIPHER_BLOCK_SIZE: 16,       // Block AES
  CIPHER_MAC_SIZE: 2,          // HMAC-SHA256 tronqué (!)
  PATH_HASH_SIZE: 1,           // Hash nœud = 1er byte pubkey
  MAX_HASH_SIZE: 8,            // Hash paquet complet
  
  // Timing (ms) - important pour timeouts UI
  ACK_TIMEOUT_FLOOD: 32000,    // 32s max pour mode flood
  ACK_TIMEOUT_DIRECT: 10000,   // 10s base pour mode direct
  CAD_RETRY_BASE: 120,         // Listen Before Talk retry
  CAD_MAX_BUSY: 4000,          // Max attente canal libre
  RX_WATCHDOG: 8000,           // Détection radio bloquée
  
  // BLE
  BLE_MAX_WRITE: 182,
} as const;

// ============================================================================
// STRUCTURES DE DONNÉES PRINCIPALES
// ============================================================================

/**
 * Contact MeshCore avec index firmware CRITIQUE
 * 
 * L'index firmware est attribué par le device et est OBLIGATOIRE
 * pour envoyer des messages (CMD_SEND_TXT_MSG utilise l'index, pas la pubkey!)
 */
export interface MeshContact {
  /** Index dans la table du firmware (0-99) - CRITIQUE */
  firmwareIndex: number;
  
  /** Clé publique complète (64 caractères hex) */
  pubkeyHex: string;
  
  /** Préfixe 6 bytes pour l'affichage rapide */
  pubkeyPrefix: string;
  
  /** Hash 1 byte = premier byte de la pubkey (pour routage) */
  hash: string;
  
  /** Nom affiché (max 32 caractères) */
  name: string;
  
  /** Type de contact (CHAT=0, REPEATER=1, ROOM_SERVER=2, SENSOR=3) */
  type: number;
  
  /** Flags (favori, perdu...) */
  flags: number;
  
  /** Longueur du path connu (0 = inconnu → utiliser FLOOD) */
  outPathLen: number;
  
  /** Path vers ce contact (array de hashes de saut) */
  outPath: Uint8Array;
  
  /** Timestamp dernier advert reçu (Unix) */
  lastAdvert: number;
  
  /** Timestamp dernière modification (Unix) */
  lastmod: number;
  
  /** Position GPS latitude (optionnel) */
  gpsLat?: number;
  
  /** Position GPS longitude (optionnel) */
  gpsLon?: number;
}

/**
 * Message reçu du réseau mesh
 */
export interface MeshMessage {
  /** Index du contact expéditeur dans la table firmware */
  contactIndex: number;
  
  /** Path parcouru (array de hashes) */
  path: number[];
  
  /** Timestamp du message (Unix) */
  timestamp: number;
  
  /** Contenu texte déchiffré */
  text: string;
  
  /** Timestamp réception locale (ms) */
  receivedAt: number;
  
  /** SNR (Signal-to-Noise Ratio) x4 si disponible */
  snr?: number;
}

/**
 * Confirmation d'envoi (PUSH_SEND_CONFIRMED 0x82)
 * Reçue quand l'ACK LoRa est revenu du destinataire
 */
export interface SendConfirmation {
  /** Code ACK (checksum du message original) */
  ackCode: number;
  
  /** Round-trip time en millisecondes */
  roundTripMs: number;
  
  /** Index du contact (si identifiable) */
  contactIndex?: number;
}

/**
 * Information canal de groupe
 */
export interface ChannelInfo {
  /** Index du canal (0=public, 1-7=privés) */
  index: number;
  
  /** Nom du canal (32 caractères max) */
  name: string;
  
  /** Secret partagé pour chiffrement (Base64) */
  secret: string;
}

/**
 * Information appareil local (SelfInfo)
 * Retournée par le firmware après connexion
 */
export interface DeviceInfo {
  /** Nom du nœud configuré */
  name: string;
  
  /** Clé publique Ed25519 (32 bytes) */
  publicKey: Uint8Array;
  
  /** Fréquence radio en MHz (ex: 869.525) */
  freq: number;
  
  /** Spreading Factor (7-12) */
  sf: number;
  
  /** Bandwidth en kHz (125 ou 250) */
  bw: number;
  
  /** Coding Rate (5-8) */
  cr: number;
  
  /** Puissance TX en dBm */
  txPower: number;
  
  /** Version du firmware */
  firmwareVersion?: string;
  
  /** Type de nœud */
  nodeType?: number;
  
  /** Nom affiché (généré ou configuré) */
  displayName?: string;
}

/**
 * Advert reçu (PUSH_ADVERT 0x80)
 * Annonce périodique d'un nœud sur le réseau
 */
export interface AdvertInfo {
  /** Clé publique du nœud (32 bytes) */
  publicKey: Uint8Array;
  
  /** Timestamp de l'advert (Unix) */
  timestamp: number;
  
  /** Signature Ed25519 (64 bytes) */
  signature: Uint8Array;
  
  /** Données applicatives (max 32 bytes) */
  appData: Uint8Array;
  
  /** Type de nœud */
  nodeType: number;
  
  /** SNR reçu x4 */
  snr?: number;
  
  /** RSSI reçu */
  rssi?: number;
}

/**
 * Mise à jour de path (PUSH_PATH_UPDATED 0x81)
 * Le firmware a découvert un meilleur chemin vers un contact
 */
export interface PathUpdate {
  /** Index du contact concerné */
  contactIndex: number;
  
  /** Nouveau path découvert */
  path: Uint8Array;
  
  /** Qualité estimée du lien (0-255, plus=haut) */
  pathQuality?: number;
}

/**
 * Statistiques radio détaillées
 */
export interface RadioStats {
  /** Packets envoyés par ce nœud */
  packetsSent: number;
  
  /** Packets reçus valides */
  packetsReceived: number;
  
  /** Packets relayés pour autres nœuds */
  packetsRelayed: number;
  
  /** Packets dropped (erreur/doublon) */
  packetsDropped: number;
  
  /** Airtime total utilisé (ms) */
  airtimeUsed: number;
  
  /** Budget airtime restant (ms) */
  airtimeBudget: number;
  
  /** SNR moyen des paquets reçus */
  avgSnr: number;
  
  /** RSSI moyen des paquets reçus */
  avgRssi: number;
  
  /** Nombre de voisins directs visibles */
  neighbourCount?: number;
}

/**
 * Configuration radio complète
 */
export interface RadioConfig {
  /** Fréquence en MHz */
  frequency: number;
  
  /** Spreading Factor (7-12) */
  spreadingFactor: number;
  
  /** Bandwidth en kHz */
  bandwidth: number;
  
  /** Coding Rate */
  codingRate: number;
  
  /** Puissance TX dBm */
  txPower: number;
  
  /** Fréquence si changement régional nécessaire */
  regionCode?: string;
}

// ============================================================================
// TYPES POUR L'UI ET L'ÉTAT
// ============================================================================

/**
 * État d'un message en cours d'envoi (pour UI)
 */
export interface PendingMessage {
  /** ID unique local */
  id: string;
  
  /** Index contact (si DM) */
  contactIndex?: number;
  
  /** Index canal (si broadcast) */
  channelIndex?: number;
  
  /** Texte envoyé */
  text: string;
  
  /** Timestamp envoi (ms) */
  sentAt: number;
  
  /** 
   * Statut du message:
   * - 'sending': Envoyé au firmware
   * - 'sent': Accepté par firmware, attente ACK LoRa
   * - 'confirmed': ACK reçu!
   * - 'failed': Échec (timeout ou erreur)
   */
  status: 'sending' | 'sent' | 'confirmed' | 'failed';
  
  /** Code ACK attendu/reçu */
  ackCode?: number;
  
  /** RTT mesuré (ms) si confirmé */
  rtt?: number;
  
  /** Nombre de tentatives */
  attempts: number;
  
  /** Message d'erreur si failed */
  error?: string;
}

/**
 * État de la connexion BLE
 */
export interface BleConnectionState {
  connected: boolean;
  connecting: boolean;
  device: BleDevice | null;
  error: string | null;
  
  /** Protocole négocié avec le firmware */
  protocolVersion: number;
  
  /** Handshake complété */
  handshakeComplete: boolean;
}

/**
 * Périphérique BLE détecté
 */
export interface BleDevice {
  /** ID unique (MAC sur Android, UUID sur iOS) */
  id: string;
  
  /** Nom affiché (peut être null) */
  name: string | null;
  
  /** RSSI en dBm */
  rssi: number;
  
  /** Données fabricant si disponibles */
  manufacturerData?: string;
}

/**
 * Options d'envoi de message
 */
export interface SendOptions {
  /** Mode de routage: 'flood' ou 'direct' */
  routeMode?: 'flood' | 'direct';
  
  /** Forcer l'envoi même sans path connu */
  forceFlood?: boolean;
  
  /** Timeout attente ACK (ms) */
  ackTimeout?: number;
  
  /** Nombre max de retries */
  maxRetries?: number;
  
  /** Priorité (plus haut = traité avant) */
  priority?: number;
}

/**
 * Événement de log pour debugging
 */
export interface MeshLogEvent {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: any;
}

// ============================================================================
// UTILITAIRES DE CONVERSION
// ============================================================================

/**
 * Convertit un buffer en chaîne hexadécimale
 */
export function bufferToHex(buffer: Uint8Array | ArrayBuffer): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convertit une chaîne hexadécimale en Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convertit un hash 1 byte en chaîne hex
 */
export function hashToHex(hash: number): string {
  return hash.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Extrait les informations du header MeshCore LoRa
 */
export function parseLoRaHeader(header: number): {
  routeType: number;
  payloadType: number;
  version: number;
} {
  return {
    routeType: header & 0x03,
    payloadType: (header >> 2) & 0x0F,
    version: (header >> 6) & 0x03,
  };
}

/**
 * Construit un header MeshCore LoRa
 */
export function buildLoRaHeader(
  routeType: number,
  payloadType: number,
  version: number = 0
): number {
  return ((version & 0x03) << 6) |
         ((payloadType & 0x0F) << 2) |
         (routeType & 0x03);
}

/**
 * Décode un nom depuis bytes null-terminated
 */
export function decodeName(data: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, data.length);
  while (end < limit && data[end] !== 0) {
    end++;
  }
  return new TextDecoder().decode(data.slice(offset, end));
}

/**
 * Encode un nom en bytes null-terminated
 */
export function encodeName(name: string, maxLen: number): Uint8Array {
  const encoded = new TextEncoder().encode(name.slice(0, maxLen - 1));
  const result = new Uint8Array(maxLen);
  result.set(encoded);
  return result;
}

/**
 * Génère un NodeId lisible à partir d'une clé publique
 * Format: MESH-XXXXXXXX (8 premiers caractères hex)
 */
export function generateNodeId(pubkeyHex: string): string {
  return `MESH-${pubkeyHex.slice(0, 8).toUpperCase()}`;
}

/**
 * Génère un nom court pour l'affichage
 */
export function generateShortName(pubkeyHex: string): string {
  return pubkeyHex.slice(0, 6).toUpperCase();
}

/**
 * Vérifie si un hash est valide (ni 0x00 ni 0xFF réservés)
 */
export function isValidHash(hash: number): boolean {
  return hash !== 0x00 && hash !== 0xFF;
}

/**
 * Calcule l'airtime estimé pour un paquet LoRa
 * Formule simplifiée pour SF11 BW250
 */
export function estimateAirtimeMs(
  payloadLen: number,
  sf: number = 11,
  bwKhz: number = 250
): number {
  // Overhead: preamble(8) + header(4) + payload + CRC(2)
  const totalBytes = 8 + 4 + payloadLen + 2;
  const totalBits = totalBytes * 8;
  
  // Symbol rate = BW / 2^SF
  // Symbol duration = 1000ms / symbolRate
  const symbolDuration = (1000 * (1 << sf)) / (bwKhz * 1000);
  
  // Nombre de symbols = bits / (SF * 4) avec CR=4/5
  const numSymbols = totalBits / (sf * 4);
  
  return Math.ceil(numSymbols * symbolDuration);
}

/**
 * Calcule le temps d'attente ACK basé sur le mode
 */
export function calculateAckTimeout(
  routeMode: 'flood' | 'direct',
  pathLen: number = 0,
  sf: number = 11
): number {
  if (routeMode === 'flood') {
    // Flood: jusqu'à 32s avec SF11
    return LIMITS.ACK_TIMEOUT_FLOOD * (11 / sf);
  } else {
    // Direct: base + temps par saut
    const hopTime = estimateAirtimeMs(50, sf) * 2; // Aller-retour approx
    return LIMITS.ACK_TIMEOUT_DIRECT + (pathLen * hopTime);
  }
}

/**
 * Valide un message avant envoi
 * Retourne null si OK, sinon message d'erreur
 */
export function validateMessage(text: string): string | null {
  if (!text || text.length === 0) {
    return 'Message vide';
  }
  if (text.length > LIMITS.MAX_MESSAGE_LENGTH) {
    return `Message trop long (${text.length}/${LIMITS.MAX_MESSAGE_LENGTH} caractères)`;
  }
  return null;
}

/**
 * Crée un contact minimal pour ajout au firmware
 */
export function createMinimalContact(
  pubkeyHex: string,
  name: string,
  type: number = CONTACT_TYPES.CHAT
): Omit<MeshContact, 'firmwareIndex'> {
  const pubkeyBytes = hexToBuffer(pubkeyHex);
  return {
    pubkeyHex,
    pubkeyPrefix: bufferToHex(pubkeyBytes.slice(0, 6)),
    hash: bufferToHex(pubkeyBytes.slice(0, 1)),
    name: name.slice(0, LIMITS.MAX_NAME_LENGTH - 1),
    type,
    flags: 0,
    outPathLen: 0,
    outPath: new Uint8Array(0),
    lastAdvert: 0,
    lastmod: Math.floor(Date.now() / 1000),
  };
}

// ============================================================================
// MESSAGES D'ERREUR UTILISATEUR
// ============================================================================

export const ERROR_MESSAGES: Record<string, string> = {
  'Contact non synchronisé': 'Scannez à nouveau ce contact ou synchronisez les contacts',
  'Timeout récupération contacts': 'Vérifiez la connexion BLE et réessayez',
  'Message trop long': `Maximum ${LIMITS.MAX_MESSAGE_LENGTH} caractères par message`,
  'Contact table full': 'Limite de 100 contacts atteinte. Supprimez des contacts.',
  'Non connecté': 'Connectez-vous d\'abord à un device MeshCore',
  'Timeout envoi': 'Pas de confirmation reçue. Le message a peut-être été envoyé.',
  'Invalid contact index': 'Index contact invalide. Resynchronisez les contacts.',
  'Protocol error': 'Erreur de communication avec le firmware. Reconnectez.',
};

// Export par défaut
export default {
  PROTOCOL_VERSION,
  BLE_SERVICE_UUID,
  BLE_RX_CHAR_UUID,
  BLE_TX_CHAR_UUID,
  BLE_MAX_WRITE,
  CMD_CODES,
  RESP_CODES,
  PUSH_CODES,
  ERR_CODES,
  ROUTE_TYPES,
  PAYLOAD_TYPES,
  CONTACT_TYPES,
  CONTACT_FLAGS,
  REQ_TYPES,
  LIMITS,
  ERROR_MESSAGES,
};
