export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: number;
  status: 'sent' | 'delivered' | 'failed' | 'pending';
  isBtcPayment?: boolean;
  btcAmount?: number;
  isCashuToken?: boolean;
  cashuAmount?: number;
  isChunked?: boolean;
  chunkInfo?: {
    messageId: string;
    totalChunks: number;
    receivedChunks: number;
    dataType: 'CASHU' | 'LN_INV' | 'BTC_TX';
    isComplete: boolean;
  };
}

export interface Chat {
  id: string;
  name: string;
  nodeId: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  online: boolean;
  signalStrength: number;
  hops: number;
  avatar: string;
  messages: Message[];
}

export type PairingState = 'discovered' | 'pairing' | 'paired' | 'failed' | 'unknown';
export type DeviceType = 'node' | 'relay' | 'gateway' | 'repeater' | 'client';

export interface MeshNode {
  id: string;
  name: string;
  distance: string;
  distanceMeters: number;
  signalStrength: number;
  rssi: number;
  snr: number;
  battery: number;
  hops: number;
  lastSeen: number;
  isRelay: boolean;
  isOnline: boolean;
  pairingState: PairingState;
  deviceType: DeviceType;
  firmware: string;
  frequency: string;
  connectedPeers: string[];
  latitude?: number;
  longitude?: number;
  airtime: number;
  packetsRx: number;
  packetsTx: number;
  channel: number;
}

export interface Transaction {
  id: string;
  type: 'sent' | 'received';
  amount: number;
  fiatValue: number;
  contact: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
  memo?: string;
  wallet?: 'bitcoin' | 'cashu';
}

export interface CashuMint {
  id: string;
  url: string;
  name: string;
  balance: number;
  isDefault: boolean;
  status: 'online' | 'offline' | 'syncing';
  lastSync: number;
  keysetId: string;
}

export interface CashuToken {
  id: string;
  amount: number;
  mint: string;
  timestamp: number;
  spent: boolean;
  encoded: string;
}

export interface ChunkedInvoice {
  id: string;
  totalChunks: number;
  receivedChunks: number;
  dataType: 'CASHU' | 'LN_INV' | 'BTC_TX';
  messageId: string;
  isComplete: boolean;
  decodedAmount?: number;
  rawData?: string;
}

const now = Date.now();
const minute = 60 * 1000;
const hour = 60 * minute;

export const mockChats: Chat[] = [
  {
    id: '1',
    name: 'Alice',
    nodeId: 'MESH-A7F2',
    lastMessage: 'Payment received! Merci 🙏',
    lastMessageTime: now - 5 * minute,
    unreadCount: 2,
    online: true,
    signalStrength: 85,
    hops: 1,
    avatar: 'A',
    messages: [
      { id: 'm1', text: 'Hey, tu peux me send 5000 sats?', sender: 'them', timestamp: now - 30 * minute, status: 'delivered' },
      { id: 'm2', text: 'Sure, sending now via mesh', sender: 'me', timestamp: now - 28 * minute, status: 'delivered' },
      { id: 'm3', text: '⚡ 5,000 sats', sender: 'me', timestamp: now - 27 * minute, status: 'delivered', isBtcPayment: true, btcAmount: 5000 },
      { id: 'm4', text: 'Payment received! Merci 🙏', sender: 'them', timestamp: now - 5 * minute, status: 'delivered' },
      { id: 'm5c', text: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIj...', sender: 'them', timestamp: now - 3 * minute, status: 'delivered', isCashuToken: true, cashuAmount: 10000, isChunked: true, chunkInfo: { messageId: 'X7F2', totalChunks: 4, receivedChunks: 4, dataType: 'CASHU', isComplete: true } },
    ],
  },
  {
    id: '2',
    name: 'Bob (Relay)',
    nodeId: 'MESH-B3E1',
    lastMessage: 'Mesh relay active, 12 nodes connected',
    lastMessageTime: now - 2 * hour,
    unreadCount: 0,
    online: true,
    signalStrength: 72,
    hops: 1,
    avatar: 'B',
    messages: [
      { id: 'm5', text: 'Node is back up after power outage', sender: 'them', timestamp: now - 4 * hour, status: 'delivered' },
      { id: 'm6', text: 'Good. How many nodes connected?', sender: 'me', timestamp: now - 3 * hour, status: 'delivered' },
      { id: 'm7', text: 'Mesh relay active, 12 nodes connected', sender: 'them', timestamp: now - 2 * hour, status: 'delivered' },
    ],
  },
  {
    id: '3',
    name: 'Charlie',
    nodeId: 'MESH-C9D4',
    lastMessage: 'Invoice: 15,000 sats for the hardware',
    lastMessageTime: now - 6 * hour,
    unreadCount: 1,
    online: false,
    signalStrength: 35,
    hops: 3,
    avatar: 'C',
    messages: [
      { id: 'm8', text: "J'ai les modules LoRa que tu voulais", sender: 'them', timestamp: now - 8 * hour, status: 'delivered' },
      { id: 'm9', text: 'Combien?', sender: 'me', timestamp: now - 7 * hour, status: 'delivered' },
      { id: 'm10', text: 'Invoice: 15,000 sats for the hardware', sender: 'them', timestamp: now - 6 * hour, status: 'delivered' },
      { id: 'm10c', text: 'MCHK|1|B3E1|1/3|LN_INV|lnbc150u1p...', sender: 'them', timestamp: now - 5 * hour, status: 'pending', isChunked: true, chunkInfo: { messageId: 'B3E1', totalChunks: 3, receivedChunks: 2, dataType: 'LN_INV', isComplete: false } },
      { id: 'm10d', text: '', sender: 'me', timestamp: now - 4 * hour, status: 'delivered', isCashuToken: true, cashuAmount: 15000, isChunked: true, chunkInfo: { messageId: 'K9A2', totalChunks: 5, receivedChunks: 5, dataType: 'CASHU', isComplete: true } },
    ],
  },
  {
    id: '4',
    name: 'Diana',
    nodeId: 'MESH-D1F8',
    lastMessage: 'Testing the new firmware update',
    lastMessageTime: now - 12 * hour,
    unreadCount: 0,
    online: true,
    signalStrength: 58,
    hops: 2,
    avatar: 'D',
    messages: [
      { id: 'm11', text: 'New firmware v2.4 is out', sender: 'them', timestamp: now - 14 * hour, status: 'delivered' },
      { id: 'm12', text: 'Ah nice, improvements?', sender: 'me', timestamp: now - 13 * hour, status: 'delivered' },
      { id: 'm13', text: 'Testing the new firmware update', sender: 'them', timestamp: now - 12 * hour, status: 'delivered' },
    ],
  },
  {
    id: '5',
    name: 'Echo Group',
    nodeId: 'MESH-GRP1',
    lastMessage: 'Next mesh meetup Saturday 14h',
    lastMessageTime: now - 24 * hour,
    unreadCount: 0,
    online: true,
    signalStrength: 90,
    hops: 0,
    avatar: 'E',
    messages: [
      { id: 'm14', text: 'Qui vient au meetup?', sender: 'them', timestamp: now - 26 * hour, status: 'delivered' },
      { id: 'm15', text: 'Moi!', sender: 'me', timestamp: now - 25 * hour, status: 'delivered' },
      { id: 'm16', text: 'Next mesh meetup Saturday 14h', sender: 'them', timestamp: now - 24 * hour, status: 'delivered' },
    ],
  },
];

export const mockNodes: MeshNode[] = [
  {
    id: 'n1', name: 'Alice Node', distance: '0.8 km', distanceMeters: 800,
    signalStrength: 85, rssi: -62, snr: 9.5, battery: 92, hops: 1,
    lastSeen: now - 2 * minute, isRelay: false, isOnline: true,
    pairingState: 'paired', deviceType: 'client', firmware: 'v2.4.1',
    frequency: '868.1 MHz', connectedPeers: ['n2', 'n5'],
    airtime: 2.3, packetsRx: 1247, packetsTx: 892, channel: 1,
  },
  {
    id: 'n2', name: 'Bob Relay', distance: '1.2 km', distanceMeters: 1200,
    signalStrength: 72, rssi: -78, snr: 7.2, battery: 78, hops: 1,
    lastSeen: now - minute, isRelay: true, isOnline: true,
    pairingState: 'paired', deviceType: 'relay', firmware: 'v2.4.1',
    frequency: '868.1 MHz', connectedPeers: ['n1', 'n4', 'n5', 'n6'],
    airtime: 8.1, packetsRx: 5621, packetsTx: 5489, channel: 1,
  },
  {
    id: 'n3', name: 'Charlie Node', distance: '3.5 km', distanceMeters: 3500,
    signalStrength: 35, rssi: -105, snr: 1.8, battery: 45, hops: 3,
    lastSeen: now - 2 * hour, isRelay: false, isOnline: false,
    pairingState: 'failed', deviceType: 'client', firmware: 'v2.3.0',
    frequency: '868.3 MHz', connectedPeers: [],
    airtime: 0.5, packetsRx: 312, packetsTx: 198, channel: 3,
  },
  {
    id: 'n4', name: 'Diana Node', distance: '2.1 km', distanceMeters: 2100,
    signalStrength: 58, rssi: -89, snr: 5.1, battery: 88, hops: 2,
    lastSeen: now - 5 * minute, isRelay: false, isOnline: true,
    pairingState: 'paired', deviceType: 'node', firmware: 'v2.4.1',
    frequency: '868.1 MHz', connectedPeers: ['n2'],
    airtime: 1.9, packetsRx: 876, packetsTx: 654, channel: 1,
  },
  {
    id: 'n5', name: 'Relay-FR-07', distance: '1.8 km', distanceMeters: 1800,
    signalStrength: 91, rssi: -55, snr: 11.2, battery: 100, hops: 1,
    lastSeen: now - 30000, isRelay: true, isOnline: true,
    pairingState: 'paired', deviceType: 'repeater', firmware: 'v2.4.2',
    frequency: '868.1 MHz', connectedPeers: ['n1', 'n2', 'n6'],
    airtime: 12.4, packetsRx: 9823, packetsTx: 9801, channel: 1,
  },
  {
    id: 'n6', name: 'Gateway-EU', distance: '5.2 km', distanceMeters: 5200,
    signalStrength: 28, rssi: -112, snr: -1.5, battery: 67, hops: 4,
    lastSeen: now - 30 * minute, isRelay: true, isOnline: true,
    pairingState: 'paired', deviceType: 'gateway', firmware: 'v2.4.0',
    frequency: '868.5 MHz', connectedPeers: ['n2', 'n5'],
    airtime: 15.7, packetsRx: 14201, packetsTx: 13998, channel: 5,
  },
  {
    id: 'n7', name: 'Felix Node', distance: '4.0 km', distanceMeters: 4000,
    signalStrength: 42, rssi: -98, snr: 3.2, battery: 33, hops: 3,
    lastSeen: now - 4 * hour, isRelay: false, isOnline: false,
    pairingState: 'discovered', deviceType: 'client', firmware: 'v2.2.0',
    frequency: '868.1 MHz', connectedPeers: [],
    airtime: 0.1, packetsRx: 45, packetsTx: 12, channel: 1,
  },
  {
    id: 'n8', name: 'New Device', distance: '0.3 km', distanceMeters: 300,
    signalStrength: 95, rssi: -48, snr: 12.5, battery: 100, hops: 1,
    lastSeen: now - 10000, isRelay: false, isOnline: true,
    pairingState: 'discovered', deviceType: 'node', firmware: 'v2.4.2',
    frequency: '868.1 MHz', connectedPeers: [],
    airtime: 0, packetsRx: 3, packetsTx: 1, channel: 1,
  },
  {
    id: 'n9', name: 'Unknown-X4F2', distance: '1.5 km', distanceMeters: 1500,
    signalStrength: 65, rssi: -82, snr: 6.8, battery: 71, hops: 2,
    lastSeen: now - 3 * minute, isRelay: false, isOnline: true,
    pairingState: 'pairing', deviceType: 'client', firmware: 'v2.4.1',
    frequency: '868.1 MHz', connectedPeers: ['n2'],
    airtime: 0.2, packetsRx: 15, packetsTx: 8, channel: 1,
  },
];

export const mockTransactions: Transaction[] = [
  { id: 't1', type: 'sent', amount: 5000, fiatValue: 4.85, contact: 'Alice', timestamp: now - 27 * minute, status: 'confirmed', memo: 'Quick transfer' },
  { id: 't2', type: 'received', amount: 21000, fiatValue: 20.37, contact: 'Bob', timestamp: now - 6 * hour, status: 'confirmed', memo: 'Relay maintenance' },
  { id: 't3', type: 'sent', amount: 1500, fiatValue: 1.46, contact: 'Diana', timestamp: now - 18 * hour, status: 'confirmed' },
  { id: 't4', type: 'received', amount: 50000, fiatValue: 48.50, contact: 'Charlie', timestamp: now - 2 * 24 * hour, status: 'confirmed', memo: 'Hardware parts' },
  { id: 't5', type: 'sent', amount: 3000, fiatValue: 2.91, contact: 'Echo Group', timestamp: now - 3 * 24 * hour, status: 'confirmed', memo: 'Meetup contribution' },
  { id: 't6', type: 'received', amount: 10000, fiatValue: 9.70, contact: 'Alice', timestamp: now - 5 * 24 * hour, status: 'confirmed' },
];

export const walletBalance = {
  sats: 847250,
  btc: 0.0084725,
  fiatValue: 821.82,
  fiatCurrency: 'EUR',
};

export const cashuBalance = {
  totalSats: 125000,
  fiatValue: 121.25,
  fiatCurrency: 'EUR',
};

export const mockMints: CashuMint[] = [
  {
    id: 'mint1',
    url: 'https://8333.space:3338', // ✅ TESTÉ ET FONCTIONNEL
    name: 'Minibits',
    balance: 75000,
    isDefault: true,
    status: 'online',
    lastSync: now - 2 * minute,
    keysetId: 'ks_0x9a2f',
  },
  {
    id: 'mint2',
    url: 'https://legend.lnbits.com/cashu',
    name: 'LNbits Cashu',
    balance: 35000,
    isDefault: false,
    status: 'online',
    lastSync: now - 15 * minute,
    keysetId: 'ks_0x3b7e',
  },
  {
    id: 'mint3',
    url: 'https://8333.space:3338',
    name: '8333.space',
    balance: 15000,
    isDefault: false,
    status: 'offline',
    lastSync: now - 4 * hour,
    keysetId: 'ks_0xd1c4',
  },
];

export const mockCashuTokens: CashuToken[] = [
  {
    id: 'ct1',
    amount: 10000,
    mint: 'https://mint.minibits.cash',
    timestamp: now - 30 * minute,
    spent: false,
    encoded: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjEsInNlY3JldCI6ImQ4ZDkwMGI5',
  },
  {
    id: 'ct2',
    amount: 5000,
    mint: 'https://mint.minibits.cash',
    timestamp: now - 2 * hour,
    spent: false,
    encoded: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjEsInNlY3JldCI6ImU3YzRmNjBh',
  },
  {
    id: 'ct3',
    amount: 21000,
    mint: 'https://legend.lnbits.com/cashu',
    timestamp: now - 6 * hour,
    spent: true,
    encoded: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5MzI1M2U0MWUiLCJhbW91bnQiOjEsInNlY3JldCI6ImMzZDJhMWI5',
  },
];

export const mockCashuTransactions: Transaction[] = [
  { id: 'ct_t1', type: 'received', amount: 10000, fiatValue: 9.70, contact: 'Alice (Cashu)', timestamp: now - 30 * minute, status: 'confirmed', memo: 'Cashu token via mesh', wallet: 'cashu' },
  { id: 'ct_t2', type: 'sent', amount: 5000, fiatValue: 4.85, contact: 'Bob', timestamp: now - 3 * hour, status: 'confirmed', memo: 'Melted to Lightning', wallet: 'cashu' },
  { id: 'ct_t3', type: 'received', amount: 21000, fiatValue: 20.37, contact: 'Charlie', timestamp: now - 8 * hour, status: 'confirmed', memo: 'Minted from invoice', wallet: 'cashu' },
  { id: 'ct_t4', type: 'sent', amount: 3000, fiatValue: 2.91, contact: 'Diana', timestamp: now - 24 * hour, status: 'confirmed', memo: 'Token swap', wallet: 'cashu' },
];

export const mockChunkedInvoices: ChunkedInvoice[] = [
  {
    id: 'cinv1',
    totalChunks: 4,
    receivedChunks: 4,
    dataType: 'CASHU',
    messageId: 'X7F2',
    isComplete: true,
    decodedAmount: 10000,
    rawData: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IjAwOWExZjI5...',
  },
  {
    id: 'cinv2',
    totalChunks: 3,
    receivedChunks: 2,
    dataType: 'LN_INV',
    messageId: 'B3E1',
    isComplete: false,
    decodedAmount: 15000,
  },
];

export const meshStats = {
  totalNodes: 7,
  onlineNodes: 5,
  relayNodes: 3,
  meshRange: '5.2 km',
  frequency: '868 MHz',
  spreadFactor: 'SF12',
  bandwidth: '125 kHz',
  txPower: '20 dBm',
};

export interface GatewayRelayLogEntry {
  id: string;
  type: 'tx_broadcast' | 'cashu_relay' | 'cashu_redeem' | 'chunk_reassembly' | 'payment_forward';
  status: 'completed' | 'failed' | 'processing';
  sourceNodeId: string;
  timestamp: number;
  detail: string;
  bytesRelayed: number;
}

export const mockGatewayRelayLog: GatewayRelayLogEntry[] = [
  {
    id: 'rl1',
    type: 'tx_broadcast',
    status: 'completed',
    sourceNodeId: 'MESH-A7F2',
    timestamp: now - 12 * minute,
    detail: 'BTC TX broadcast to mempool.space — txid: a3f2...9e01',
    bytesRelayed: 420,
  },
  {
    id: 'rl2',
    type: 'cashu_relay',
    status: 'completed',
    sourceNodeId: 'MESH-B3E1',
    timestamp: now - 35 * minute,
    detail: 'Cashu token relayed to mint.minibits.cash — 5,000 sats',
    bytesRelayed: 860,
  },
  {
    id: 'rl3',
    type: 'chunk_reassembly',
    status: 'completed',
    sourceNodeId: 'MESH-C9D4',
    timestamp: now - 1 * hour,
    detail: 'Reassembled CASHU token from 4 chunks — msgId: X7F2',
    bytesRelayed: 1240,
  },
  {
    id: 'rl4',
    type: 'payment_forward',
    status: 'completed',
    sourceNodeId: 'MESH-D1F8',
    timestamp: now - 2 * hour,
    detail: 'LN invoice forwarded via MQTT — 15,000 sats',
    bytesRelayed: 680,
  },
  {
    id: 'rl5',
    type: 'tx_broadcast',
    status: 'failed',
    sourceNodeId: 'MESH-A7F2',
    timestamp: now - 3 * hour,
    detail: 'BTC TX rejected — insufficient fee',
    bytesRelayed: 0,
  },
  {
    id: 'rl6',
    type: 'cashu_redeem',
    status: 'completed',
    sourceNodeId: 'MESH-B3E1',
    timestamp: now - 4 * hour,
    detail: 'Cashu redeem at 8333.space — 3,000 sats melted',
    bytesRelayed: 540,
  },
];

export const mockGatewayStats = {
  txRelayed: 14,
  cashuRelayed: 23,
  chunksProcessed: 87,
  messagesForwarded: 156,
  bytesRelayed: 48920,
  peersServed: 5,
  failedJobs: 3,
  uptime: '4h 32m',
};
